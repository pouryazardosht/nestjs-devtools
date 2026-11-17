# PROTOCOL.md — Versioned JSON-RPC Contract (v1 draft)

One protocol, two transports: **UDS** (integrated/VS Code bridge) and **stdio** (standalone agent). The Swift app and the extension are written against this document only.

---

## 1. Envelope & framing

- **JSON-RPC 2.0** over byte-framed UTF-8 streams:
  `Content-Length: <n>\r\n\r\n<json>` (same framing as LSP; keep tooling compatible).
- Max message size: 16 MB (analysis payloads are paged above that — see `search/*`).
- All strings UTF-8; line numbers are 0-based in protocol payloads (extension converts at its UI boundary).

## 2. Lifecycle

```
app → agent/bridge : initialize { protocolVersion, appVersion, capabilities: [] }
        ← result   : { protocolVersion, capabilities: [...], adapter: "standalone"|"integrated",
                       extensionVersion?, nestVersion?, project?: ProjectMetadata }
app → … : initialized {}
app → … : shutdown            (graceful; agent flushes + exits, bridge keeps serving the extension)
```

- `protocolVersion` follows semver; **major** mismatch → typed error `E_PROTOCOL_VERSION` (app may fall back to standalone).
- Requests carry `id`; notifications carry no `id`. **Cancellation:** `$/cancelRequest { id }` (JSON-RPC standard).
- EOF between frames = normal shutdown. EOF mid-frame = truncated message → stderr report + supervisor restart (agent only).

## 3. Methods (v1 catalog)

### project/*
| Method | Params → Result |
|---|---|
| `project/detect` | `{ rootPath }` → `{ isNest: bool, nestVersion?, packageManager?, tsVersion? }` |
| `project/metadata` | `{}` → `ProjectMetadata` (name, location, versions, mode) |
| `project/health` | `{}` → `ProjectHealth` (modules, controllers, providers, routes, files, diIssues, conflicts, swaggerCoverage) |

### modules/*
| Method | Params → Result |
|---|---|
| `modules/tree` | `{}` → `ModuleNode[]` (root modules, nested, own files, health) |
| `modules/contents` | `{ modulePath }` → `{ ownFiles, nestedModules, issues }` |
| `modules/registrations` | `{}` → `RegistrationEntry[]` (name, key, module) |
| `modules/graph` | `{}` → `ModuleGraph { nodes, edges }` (imports/exports edges) — v1.1 |

### routes/*
| Method | Params → Result |
|---|---|
| `routes/list` | `{ includePrefix?: bool }` → `RouteInfo[]` (verb, fullPath, basePath, version, handler, line, controller, summary, tags) |
| `routes/conflicts` | `{}` → `RouteConflict[]` (kind, confidence, message, knownLimits?, routes[]) |
| `routes/controller` | `{ controllerPath }` → `RouteInfo[]` |
| `routes/export` | `{ route | controllerPath, format: "plain"\|"url"\|"curl" }` → `{ text }` |

### providers/*
| Method | Params → Result |
|---|---|
| `providers/list` | `{}` → `ProviderClassInfo[]` (className, uri, line, decorator, registered, registeredIn?) |
| `providers/registrations` | `{}` → `RegistrationEntry[]` |
| `providers/usages` | `{ uri }` → grouped references with `injectionSite` flags |
| `providers/providingModule` | `{ uri }` → `{ moduleName, uri } | null` |

### diagnostics/*
| Method | Params → Result |
|---|---|
| `diagnostics/list` | `{ categories? }` → `Diagnostic[]` (severity, title, message, knownLimits?, uri, line, related[]) |
| `diagnostics/coverage` | `{}` → swagger coverage summary |

### logging/*
| Method | Params → Result |
|---|---|
| `logging/find` | `{ uri }` → `LogStatement[]` (startLine, endLine, preview) |
| `logging/insert-preview` | `{ uri, line, method, variable, template }` → `ActionPreview` |
| `logging/remove-preview` | `{ uri, statementIds }` → `ActionPreview` |

### generation/*
| Method | Params → Result |
|---|---|
| `generation/types` | `{}` → `NestType[]` (built-in + custom) |
| `generation/preview` | `{ dir, type, name, spec? }` → `ActionPreview` (files + content) |
| `generation/apply` | `{ previewId }` → `{ applied: FileResult[] }` |

### actions/* (the only mutation path)
| Method | Params → Result |
|---|---|
| `actions/preview` | `{ action: <action-specific params> }` → `ActionPreview { id, files: [{ uri, hunks[] }], summary }` |
| `actions/apply` | `{ id }` → `{ results: FileResult[] }` — applies exactly the previewed change; previews expire after 5 min |
| `actions/applyResult` | success/failure per file with rollback report on partial failure |

### editor/* (integrated adapter only)
| Method | Params → Result |
|---|---|
| `editor/open` | `{ uri, line?, col?, reveal? }` → `{}` — opens in VS Code |
| `editor/applyWorkspaceEdit` | `{ previewId }` → delegated WorkspaceEdit application |
| `editor/quickFix` | `{ uri, line }` → available code actions |

### search/*
| Method | Params → Result |
|---|---|
| `search/query` | `{ query, scopes? }` → paged `SearchResult[]` (files, modules, providers, routes, methods, diagnostics) |
| `search/methods` | `{ uri }` → `MethodInfo[]` |

## 4. Notifications

| Notification | Payload | Notes |
|---|---|---|
| `workspace/event` | `{ kind: "create"\|"delete"\|"save", uri }` | debounced/coalesced by the sender |
| `analysis/status` | `{ phase: "idle"\|"indexing"\|"ready", progress? }` | drives app UI |
| `log` | `{ level, message }` | agent/extension diagnostics |
| `conflictsChanged` | `{ count }` | pushes conflict-count updates |

## 5. Error codes

| Code | Meaning |
|---|---|
| `-32700` / `-32600` / `-32601` / `-32602` | JSON-RPC standard (parse / invalid request / method not found / invalid params) |
| `-32000` | internal error (message in `data`) |
| `E_PROTOCOL_VERSION` | handshake version mismatch |
| `E_CAPABILITY_MISSING` | adapter doesn't implement the method (e.g. `editor/*` on standalone) |
| `E_CANCELLED` | request cancelled by `$/cancelRequest` |
| `E_PREVIEW_EXPIRED` | `actions/apply` after expiry |
| `E_OUTSIDE_WORKSPACE` | path escaped the project root |
| `E_INDEXING` | request raced an initial index build; retry |

## 6. Validation & versioning

- Every payload validated against a JSON Schema from `packages/contracts/` at the boundary (agent and extension validate before send; Swift decodes after validate).
- `contracts` package publishes semver'd schemas; `initialize` negotiates the highest common minor.
- Additive changes (new optional fields, new methods) = minor bump; removals/semantic changes = major bump.
- Golden framing/handshake transcripts tested against both adapters (salvage transcript tests reused).
