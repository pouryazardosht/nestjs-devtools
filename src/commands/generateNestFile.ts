import * as path from "path";
import * as vscode from "vscode";
import { getEffectiveNestTypes } from "../constants";

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

const TEMPLATES: Record<string, (name: string) => string> = {
  service: (name) =>
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${toPascalCase(name)}Service {
  constructor() {}
}
`,
  controller: (name) =>
    `import { Controller } from '@nestjs/common';

@Controller('${toKebabCase(name)}')
export class ${toPascalCase(name)}Controller {
  constructor() {}
}
`,
  module: (name) =>
    `import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class ${toPascalCase(name)}Module {}
`,
  guard: (name) =>
    `import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ${toPascalCase(name)}Guard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return true;
  }
}
`,
  gateway: (name) =>
    `import { WebSocketGateway, WebSocketServer, SubscribeMessage } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway()
export class ${toPascalCase(name)}Gateway {
  @WebSocketServer()
  server: Server;
}
`,
  interceptor: (name) =>
    `import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class ${toPascalCase(name)}Interceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();
  }
}
`,
  pipe: (name) =>
    `import { Injectable, PipeTransform, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class ${toPascalCase(name)}Pipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    return value;
  }
}
`,
  filter: (name) =>
    `import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class ${toPascalCase(name)}Filter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
`,
  resolver: (name) =>
    `import { Resolver, Query } from '@nestjs/graphql';

@Resolver()
export class ${toPascalCase(name)}Resolver {
  @Query(() => String)
  ${toCamelCase(name)}(): string {
    return '${name}';
  }
}
`,
  decorator: (name) =>
    `import { SetMetadata } from '@nestjs/common';

export const ${toPascalCase(name)} = (...args: string[]) =>
  SetMetadata('${toCamelCase(name)}', args);
`,
  entity: (name) =>
    `import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ${toPascalCase(name)}Document = ${toPascalCase(name)} & Document;

@Schema()
export class ${toPascalCase(name)} {
  @Prop({ required: true })
  name: string;
}

export const ${toPascalCase(name)}Schema = SchemaFactory.createForClass(
  ${toPascalCase(name)},
);
`,
  dto: (name) =>
    `export class ${toPascalCase(name)}Dto {
}
`,
  enum: (name) =>
    `export enum ${toPascalCase(name)} {
}
`,
  interface: (name) =>
    `export interface I${toPascalCase(name)} {
}
`,
  repository: (name) =>
    `import { Injectable } from '@nestjs/common';

@Injectable()
export class ${toPascalCase(name)}Repository {
  constructor() {}
}
`,
  middleware: (name) =>
    `import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class ${toPascalCase(name)}Middleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    next();
  }
}
`,
  strategy: (name) =>
    `import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';

@Injectable()
export class ${toPascalCase(name)}Strategy extends PassportStrategy(Strategy) {
  constructor() {
    super();
  }

  async validate(payload: any): Promise<any> {
    return payload;
  }
}
`,
};

export async function generateNestFileCommand(
  targetDirOrItem?: string | { moduleDir?: string },
) {
  // Called from tree view right-click or command palette
  let dir: string | undefined;

  if (typeof targetDirOrItem === "string") {
    dir = targetDirOrItem;
  } else if (
    targetDirOrItem &&
    typeof targetDirOrItem === "object" &&
    targetDirOrItem.moduleDir
  ) {
    dir = targetDirOrItem.moduleDir;
  } else {
    // Fallback: use current active editor's directory
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      dir = path.dirname(editor.document.uri.fsPath);
    } else {
      vscode.window.showWarningMessage(
        "⚠️ Open a file inside a module first, or right-click a module in the sidebar.",
      );
      return;
    }
  }

  // Step 1: pick file type
  const nestTypes = getEffectiveNestTypes();
  const typeItems = nestTypes.map((t) => ({
    label: t.typeLabel,
    description: `.${t.suffix}.ts`,
    suffix: t.suffix,
    iconPath: new vscode.ThemeIcon(
      t.suffix === "service"
        ? "gear"
        : t.suffix === "controller"
          ? "symbol-method"
          : t.suffix === "module"
            ? "package"
            : t.suffix === "guard"
              ? "shield"
              : t.suffix === "dto"
                ? "symbol-structure"
                : t.suffix === "entity"
                  ? "database"
                  : t.suffix === "enum"
                    ? "symbol-enum"
                    : t.suffix === "interface"
                      ? "symbol-interface"
                      : "file",
    ),
  }));

  const selectedType = await vscode.window.showQuickPick(typeItems, {
    title: "Generate NestJS File",
    placeHolder: "Select a file type to generate…",
    matchOnDescription: true,
  });
  if (!selectedType) return;

  // Step 2: pick name
  const name = await vscode.window.showInputBox({
    title: `Generate ${selectedType.label}`,
    placeHolder: `e.g. "user" → user.${selectedType.suffix}.ts`,
    prompt: `Enter a name for the new ${selectedType.label.toLowerCase()}`,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) return "Name cannot be empty";
      if (!/^[a-zA-Z][a-zA-Z0-9\-_]*$/.test(value.trim())) {
        return "Use letters, numbers, hyphens, or underscores only";
      }
      return null;
    },
  });
  if (!name) return;

  const kebabName = toKebabCase(name.trim());
  const fileName = `${kebabName}.${selectedType.suffix}.ts`;
  const filePath = path.join(dir, fileName);
  const fileUri = vscode.Uri.file(filePath);

  // Step 3: check if file already exists
  try {
    await vscode.workspace.fs.stat(fileUri);
    const overwrite = await vscode.window.showWarningMessage(
      `${fileName} already exists. Overwrite?`,
      "Yes",
      "No",
    );
    if (overwrite !== "Yes") return;
  } catch {
    // File doesn't exist — good, proceed
  }

  // Step 4: generate content from template
  const template = TEMPLATES[selectedType.suffix];
  const content = template
    ? template(kebabName)
    : `// ${toPascalCase(kebabName)}${toPascalCase(selectedType.suffix)}\n`;

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf-8"));

  const doc = await vscode.workspace.openTextDocument(fileUri);
  await vscode.window.showTextDocument(doc);
  vscode.window.setStatusBarMessage(`✅ Generated ${fileName}`, 3000);
}
