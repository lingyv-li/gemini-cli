/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { LspClient } from '../lsp/client.js';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { getErrorMessage } from '../utils/errors.js';
import {
  Position,
  Range,
  CodeActionContext,
  CallHierarchyItem,
  FormattingOptions,
} from 'vscode-languageserver-protocol';

export type LspAction =
  | 'findReferences'
  | 'goToDefinition'
  | 'getDiagnostics'
  | 'getHover'
  | 'getDocumentSymbols'
  | 'getWorkspaceSymbols'
  | 'getCodeActions'
  | 'prepareRename'
  | 'renameSymbol'
  | 'prepareCallHierarchy'
  | 'getIncomingCalls'
  | 'getOutgoingCalls'
  | 'goToImplementation'
  | 'formatDocument';

export interface LspToolParams {
  /** The LSP action to perform. */
  action: LspAction;
  /** The absolute path to the file. Required for most actions. */
  file_path?: string;
  /** The line number in the file (0-indexed). */
  line?: number;
  /** The character number in the line (0-indexed). */
  character?: number;

  /** The search query for workspace symbols. */
  query?: string;

  /** The start line of a range for code actions. */
  start_line?: number;
  /** The start character of a range for code actions. */
  start_char?: number;
  /** The end line of a range for code actions. */
  end_line?: number;
  /** The end character of a range for code actions. */
  end_char?: number;
  /** The context for a code action request. */
  context?: CodeActionContext;

  /** The new name for a rename operation. */
  newName?: string;

  /** The item for call hierarchy requests. */
  item?: CallHierarchyItem;

  /** The formatting options for document formatting. */
  formattingOptions?: FormattingOptions;
}

export class LspTool extends BaseTool<LspToolParams, ToolResult> {
  static readonly Name = 'lsp';
  // For a real implementation, you would likely get this
  // via the constructor from a central place that manages tool dependencies.
  private lspClient: LspClient | null = null;

  constructor(private projectRoot: string) {
    super(
      LspTool.Name,
      'LSP',
      'Performs language-aware operations using the Language Server Protocol (LSP) for code intelligence tasks like finding references, definitions, symbols, and more.',
      {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: 'The LSP action to perform.',
            enum: [
              'findReferences',
              'goToDefinition',
              'getDiagnostics',
              'getHover',
              'getDocumentSymbols',
              'getWorkspaceSymbols',
              'getCodeActions',
              'prepareRename',
              'renameSymbol',
              'prepareCallHierarchy',
              'getIncomingCalls',
              'getOutgoingCalls',
              'goToImplementation',
              'formatDocument',
            ],
          },
          file_path: {
            type: 'string',
            description:
              "Optional: The absolute path to the file. Must start with '/'. Required for most actions.",
          },
          line: {
            type: 'number',
            description: 'Optional: The line number in the file (0-indexed).',
          },
          character: {
            type: 'number',
            description:
              'Optional: The character number in the line (0-indexed).',
          },
          query: {
            type: 'string',
            description:
              "Optional: The search query for 'getWorkspaceSymbols'.",
          },
          start_line: {
            type: 'number',
            description:
              "Optional: The start line of a range for 'getCodeActions'.",
          },
          start_char: {
            type: 'number',
            description:
              "Optional: The start character of a range for 'getCodeActions'.",
          },
          end_line: {
            type: 'number',
            description:
              "Optional: The end line of a range for 'getCodeActions'.",
          },
          end_char: {
            type: 'number',
            description:
              "Optional: The end character of a range for 'getCodeActions'.",
          },
          context: {
            type: 'object',
            description: "Optional: The context for 'getCodeActions'.",
          },
          newName: {
            type: 'string',
            description: "Optional: The new name for 'renameSymbol'.",
          },
          item: {
            type: 'object',
            description:
              'Optional: The CallHierarchyItem for call hierarchy requests.',
          },
          formattingOptions: {
            type: 'object',
            description:
              "Optional: The formatting options for 'formatDocument'.",
          },
        },
        required: ['action'],
      },
    );
  }

  validateToolParams(params: LspToolParams): string | null {
    if (
      this.schema.parameters &&
      !SchemaValidator.validate(
        this.schema.parameters as Record<string, unknown>,
        params,
      )
    ) {
      return 'Parameters failed schema validation.';
    }

    const errors: string[] = [];

    const checkFilePath = () => {
      if (typeof params.file_path !== 'string') {
        errors.push("'file_path' is required.");
      }
    };

    const checkPosition = () => {
      if (typeof params.line !== 'number') {
        errors.push("'line' is required.");
      } else if (params.line < 0) {
        errors.push('Line must be non-negative.');
      }
      if (typeof params.character !== 'number') {
        errors.push("'character' is required.");
      } else if (params.character < 0) {
        errors.push('Character must be non-negative.');
      }
    };

    switch (params.action) {
      case 'findReferences':
      case 'goToDefinition':
      case 'getHover':
      case 'prepareRename':
      case 'prepareCallHierarchy':
      case 'goToImplementation':
        checkFilePath();
        checkPosition();
        break;
      case 'renameSymbol':
        checkFilePath();
        checkPosition();
        if (typeof params.newName !== 'string') {
          errors.push("'newName' is required.");
        }
        break;
      case 'getDiagnostics':
      case 'getDocumentSymbols':
        checkFilePath();
        break;
      case 'formatDocument':
        checkFilePath();
        if (typeof params.formattingOptions !== 'object') {
          errors.push("'formattingOptions' is required.");
        }
        break;
      case 'getWorkspaceSymbols':
        if (typeof params.query !== 'string') {
          errors.push("'query' is required.");
        }
        break;
      case 'getCodeActions':
        checkFilePath();
        if (typeof params.start_line !== 'number') {
          errors.push("'start_line' is required.");
        }
        if (typeof params.start_char !== 'number') {
          errors.push("'start_char' is required.");
        }
        if (typeof params.end_line !== 'number') {
          errors.push("'end_line' is required.");
        }
        if (typeof params.end_char !== 'number') {
          errors.push("'end_char' is required.");
        }
        if (typeof params.context !== 'object') {
          errors.push("'context' is required.");
        }
        break;
      case 'getIncomingCalls':
      case 'getOutgoingCalls':
        if (typeof params.item !== 'object') {
          errors.push("'item' is required.");
        }
        break;
      default:
        break;
    }

    if (errors.length > 0) {
      return `Invalid parameters: ${errors.join(' ')}`;
    }

    return null;
  }

  async execute(
    params: LspToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    try {
      // Lazily start the LSP client on first use.
      // In a real app, you might manage this lifecycle elsewhere.
      if (!this.lspClient || !this.lspClient.isRunning()) {
        this.lspClient = new LspClient(this.projectRoot);
        // TODO: Detect project type and choose the right server command.
        // Using typescript-language-server as an example.
        // Assumes `npm i -g typescript-language-server`
        await this.lspClient.start('typescript-language-server', ['--stdio']);
      }

      let result: unknown;
      let position: Position | undefined;
      if (params.line !== undefined && params.character !== undefined) {
        position = { line: params.line, character: params.character };
      }

      switch (params.action) {
        case 'findReferences':
          result = await this.lspClient.findReferences(
            params.file_path!,
            position!,
          );
          break;
        case 'goToDefinition':
          result = await this.lspClient.goToDefinition(
            params.file_path!,
            position!,
          );
          break;
        case 'getDiagnostics':
          result = await this.lspClient.getDiagnostics(params.file_path!);
          break;
        case 'getHover':
          result = await this.lspClient.getHover(params.file_path!, position!);
          break;
        case 'getDocumentSymbols':
          result = await this.lspClient.getDocumentSymbols(params.file_path!);
          break;
        case 'getWorkspaceSymbols':
          result = await this.lspClient.getWorkspaceSymbols(params.query!);
          break;
        case 'getCodeActions': {
          const range: Range = {
            start: { line: params.start_line!, character: params.start_char! },
            end: { line: params.end_line!, character: params.end_char! },
          };
          result = await this.lspClient.getCodeActions(
            params.file_path!,
            range,
            params.context!,
          );
          break;
        }
        case 'prepareRename':
          result = await this.lspClient.prepareRename(
            params.file_path!,
            position!,
          );
          break;
        case 'renameSymbol':
          result = await this.lspClient.renameSymbol(
            params.file_path!,
            position!,
            params.newName!,
          );
          break;
        case 'prepareCallHierarchy':
          result = await this.lspClient.prepareCallHierarchy(
            params.file_path!,
            position!,
          );
          break;
        case 'getIncomingCalls':
          result = await this.lspClient.getIncomingCalls(params.item!);
          break;
        case 'getOutgoingCalls':
          result = await this.lspClient.getOutgoingCalls(params.item!);
          break;
        case 'goToImplementation':
          result = await this.lspClient.goToImplementation(
            params.file_path!,
            position!,
          );
          break;
        case 'formatDocument':
          result = await this.lspClient.formatDocument(
            params.file_path!,
            params.formattingOptions!,
          );
          break;
        default:
          // This should be unreachable due to schema validation, but it's good practice
          // to handle it defensively.
          throw new Error(`Unsupported LSP action: '${params.action}'`);
      }

      const resultString = JSON.stringify(result, null, 2);
      return { llmContent: resultString, returnDisplay: 'llm' };
    } catch (e) {
      const errorMessage = `LSP tool action '${params.action}' failed: ${getErrorMessage(e)}`;
      return { llmContent: errorMessage, returnDisplay: 'llm' };
    }
  }
}
