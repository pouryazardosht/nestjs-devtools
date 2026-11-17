import { RouteInfo } from "./routeUtils";

/**
 * Route Conflict & Shadow Detection — a pure grouping pass over the routes
 * the parser already produces. NestJS 12 added runtime duplicate-route
 * warnings to the router; this finds the same class of bug statically,
 * before the app is ever started.
 *
 * Confidence model (every result carries one):
 *  - certain:   the two routes handle identical requests, guaranteed
 *  - heuristic: order-dependent — flagged with knownLimits
 *  - info:      not a bug, surfaced for awareness only
 */

export type ConflictConfidence = "certain" | "heuristic" | "info";

export type ConflictKind =
  | "duplicate" // same verb + same normalized path, same version
  | "shadowed" // literal path may be swallowed by a param path
  | "verb-overlap" // @All covers every verb, including registered specific ones
  | "versioned-twin"; // same route served under several @Version values

export interface RouteConflict {
  kind: ConflictKind;
  confidence: ConflictConfidence;
  message: string;
  /** Why the heuristic might be wrong (required for heuristic results). */
  knownLimits?: string;
  /** All participating routes (≥ 2). */
  routes: RouteInfo[];
}

/**
 * Normalizes a route path for comparison: every `:whatever` becomes
 * `:param` (so `/users/:id` and `/users/:userId` are recognized as
 * identical matchers), wildcards become `*`, trailing slashes go away.
 */
export function normalizeRoutePath(fullPath: string): string {
  const segments = fullPath
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith(":") ? ":param" : s.startsWith("*") ? "*" : s));
  return "/" + segments.join("/");
}

/** Route path without its @Version segment (twins compare per version). */
function basePathOf(route: RouteInfo): string {
  if (route.version) {
    const m = route.fullPath.match(/^\/v[^/]+/);
    if (m) return route.fullPath.slice(m[0].length) || "/";
  }
  return route.fullPath;
}

const isParam = (segment: string): boolean =>
  segment.startsWith(":") || segment.startsWith("*");

/** Segments equal, or either side is a param/wildcard at this position. */
function segmentsCompatible(a: string, b: string): boolean {
  return a === b || isParam(a) || isParam(b);
}

/**
 * Finds all route conflicts. Deterministic: results are sorted
 * certain → heuristic → info, then by path.
 */
export function computeRouteConflicts(
  routes: RouteInfo[],
): RouteConflict[] {
  const conflicts: RouteConflict[] = [];
  if (routes.length < 2) return conflicts;

  interface KeyedRoute {
    route: RouteInfo;
    verb: string;
    version: string | undefined;
    basePath: string;
    norm: string;
    segments: string[];
  }

  const keyed: KeyedRoute[] = routes.map((route) => {
    const basePath = basePathOf(route);
    return {
      route,
      verb: route.httpMethod,
      version: route.version,
      basePath,
      norm: normalizeRoutePath(basePath),
      segments: basePath.split("/").filter(Boolean),
    };
  });

  function groupBy<K extends string>(
    items: KeyedRoute[],
    keyOf: (item: KeyedRoute) => K,
  ): Map<K, KeyedRoute[]> {
    const map = new Map<K, KeyedRoute[]>();
    for (const item of items) {
      const key = keyOf(item);
      const list = map.get(key);
      if (list) {
        list.push(item);
      } else {
        map.set(key, [item]);
      }
    }
    return map;
  }

  // ── 1. Exact duplicates + versioned twins (same verb + normalized path)
  for (const [, group] of groupBy(keyed, (k) => `${k.verb}|${k.norm}`)) {
    if (group.length < 2) continue;
    const verb = group[0].verb;
    const norm = group[0].norm;

    // Group by version — same version = true duplicate; different versions
    // = intended Nest versioning (info only)
    for (const [v, sameVersion] of groupBy(group, (g) => g.version ?? "-")) {
      if (sameVersion.length < 2) continue;
      const [a, b] = sameVersion;
      const nameMismatch =
        a.basePath !== b.basePath &&
        normalizeRoutePath(a.basePath) === normalizeRoutePath(b.basePath);
      conflicts.push({
        kind: "duplicate",
        confidence: "certain",
        message:
          `${verb} ${norm} is registered ${sameVersion.length} times — only the first match handles requests` +
          (nameMismatch
            ? ` (${a.basePath} and ${b.basePath} match the same requests)`
            : "") +
          (v !== "-" ? ` under version ${v}` : "") +
          ".",
        routes: sameVersion.map((g) => g.route),
      });
    }

    // Versioned twins: same verb+path served under 2+ versions
    const versions = new Set(group.map((g) => g.version ?? "-"));
    if (versions.size >= 2) {
      const label = [...versions]
        .map((v) => (v === "-" ? "(no version)" : `v${v.replace(/^v/, "")}`))
        .sort()
        .join(", ");
      conflicts.push({
        kind: "versioned-twin",
        confidence: "info",
        message: `${verb} ${norm} is served under multiple versions (${label}) — intentional if both are meant to be live.`,
        routes: group.map((g) => g.route),
      });
    }
  }

  // ── 2. @All overlapping specific verbs on the same path
  for (const [, group] of groupBy(keyed, (k) => k.norm)) {
    const alls = group.filter((g) => g.verb === "ALL");
    const specifics = group.filter((g) => g.verb !== "ALL");
    for (const s of specifics) {
      // Same version only — different versions are separate route tables
      const covering = alls.find(
        (x) => (x.version ?? "-") === (s.version ?? "-"),
      );
      if (!covering) continue;
      conflicts.push({
        kind: "verb-overlap",
        confidence: "heuristic",
        message: `@All('${basePathOf(covering.route).replace(/^\//, "")}') handles every verb — it overlaps ${s.verb} ${s.norm} registered alongside it.`,
        knownLimits:
          "Static analysis can't know route registration order — verify whether the @All handler is meant to cover this verb.",
        routes: [covering.route, s.route],
      });
    }
  }

  // ── 3. Literal paths shadowed by param paths (same verb + version,
  //      same segment count)
  const seenPairs = new Set<string>();
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i];
      const b = keyed[j];
      if (a.verb !== b.verb || a.verb === "ALL") continue;
      if ((a.version ?? "-") !== (b.version ?? "-")) continue;
      if (a.segments.length !== b.segments.length) continue;

      let differing = 0;
      let literalVsParam = false;
      let compatible = true;
      for (let k = 0; k < a.segments.length; k++) {
        const sa = a.segments[k];
        const sb = b.segments[k];
        if (sa === sb) continue;
        if (!segmentsCompatible(sa, sb)) {
          compatible = false;
          break;
        }
        differing++;
        if (
          (isParam(sa) && !isParam(sb)) ||
          (isParam(sb) && !isParam(sa))
        ) {
          literalVsParam = true;
        }
      }
      // True shadow candidate: the paths differ in EXACTLY ONE position,
      // where one side is a param and the other a literal — then a request
      // for the literal path matches BOTH routes and registration order
      // decides. Pairs differing in 2+ positions only partially overlap
      // (e.g. /invoices/company/:id vs /invoices/:id/history — some
      // requests hit both, but neither can swallow the other); flagging
      // them flooded real projects with noise, so they're skipped.
      if (!compatible || differing !== 1 || !literalVsParam) continue;

      // Identify the literal-only side for a clearer message when one
      // exists (both-mixed pairs are still flagged, ordered as-is)
      const aAllLiteral = a.segments.every((s) => !isParam(s));
      const bAllLiteral = b.segments.every((s) => !isParam(s));
      const shadowPair =
        aAllLiteral || bAllLiteral
          ? { literalRoute: aAllLiteral ? a : b, paramRoute: aAllLiteral ? b : a }
          : { literalRoute: b, paramRoute: a };

      const pairKey = `${a.route.uri.fsPath}:${a.route.line}|${b.route.uri.fsPath}:${b.route.line}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      conflicts.push({
        kind: "shadowed",
        confidence: "heuristic",
        message: `${a.verb} ${normalizeRoutePath(shadowPair.literalRoute.basePath)} may be shadowed by ${a.verb} ${normalizeRoutePath(shadowPair.paramRoute.basePath)} — the param route can swallow the literal path depending on registration order.`,
        knownLimits:
          "Route resolution depends on module/controller registration order, which static analysis can't see. If both routes must work, order them so the literal path registers first.",
        routes: [a.route, b.route],
      });
    }
  }

  const order: Record<ConflictConfidence, number> = {
    certain: 0,
    heuristic: 1,
    info: 2,
  };
  return conflicts.sort(
    (a, b) =>
      order[a.confidence] - order[b.confidence] ||
      a.message.localeCompare(b.message),
  );
}
