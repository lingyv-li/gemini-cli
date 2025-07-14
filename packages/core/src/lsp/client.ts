/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createProtocolConnection,
  ProtocolConnection,
  StreamMessageReader,
  StreamMessageWriter,
  Diagnostic,
  DocumentSymbol,
  SymbolInformation,
  CodeAction,
  Command,
  Range,
  WorkspaceEdit,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  LocationLink,
  TextEdit,
  InitializeResult,
  ReferenceParams,
  Location,
  Position,
  DefinitionParams,
  HoverParams,
  Hover,
  DocumentSymbolParams,
  WorkspaceSymbolParams,
  CodeActionParams,
  CodeActionContext,
  RenameParams,
  PrepareRenameParams,
  CallHierarchyPrepareParams,
  CallHierarchyIncomingCallsParams,
  CallHierarchyOutgoingCallsParams,
  ImplementationParams,
  DocumentFormattingParams,
  FormattingOptions,
} from 'vscode-languageserver-protocol/node.js';
import { spawn, ChildProcess } from 'child_process';
import { URI } from 'vscode-uri';

/**
 * A client to manage communication with a Language Server.
 */
export class LspClient {
  private connection: ProtocolConnection | null = null;
  private process: ChildProcess | null = null;
  private initializeResult: InitializeResult | null = null;

  constructor(private projectRoot: string) {}

  /**
   * Starts the language server process and connects the client.
   * @param serverCommand The command to start the language server (e.g., 'typescript-language-server').
   * @param serverArgs Arguments for the server command (e.g., ['--stdio']).
   */
  async start(
    serverCommand: string,
    serverArgs: string[],
  ): Promise<InitializeResult> {
    if (this.initializeResult) {
      return this.initializeResult;
    }

    if (!this.connection) {
      this.process = spawn(serverCommand, serverArgs, {
        cwd: this.projectRoot,
        shell: true, // Use shell for commands like `npm run ...`
      });

      const reader = new StreamMessageReader(
        this.process.stdout as NodeJS.ReadableStream,
      );
      const writer = new StreamMessageWriter(
        this.process.stdin as NodeJS.WritableStream,
      );

      this.connection = createProtocolConnection(reader, writer);
      this.connection.listen();
    }

    const result = await this.connection.sendRequest<InitializeResult>(
      'initialize',
      {
        processId: this.process!.pid,
        rootUri: URI.file(this.projectRoot).toString(),
        capabilities: {},
      },
    );

    this.initializeResult = result;

    return result;
  }

  async stop(): Promise<void> {
    if (this.connection) {
      this.connection.dispose();
      this.connection = null;
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.initializeResult = null;
  }

  isRunning(): boolean {
    return !!this.connection;
  }

  /**
   * Finds all references to a symbol at a given position in a file.
   */
  async findReferences(
    filePath: string,
    position: Position,
  ): Promise<Location[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: ReferenceParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
      context: { includeDeclaration: true },
    };
    return this.connection.sendRequest<Location[] | null>(
      'textDocument/references',
      params,
    );
  }

  /**
   * Goes to the definition of a symbol at a given position in a file.
   */
  async goToDefinition(
    filePath: string,
    position: Position,
  ): Promise<Location | Location[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: DefinitionParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
    };
    return this.connection.sendRequest<Location | Location[] | null>(
      'textDocument/definition',
      params,
    );
  }

  /**
   * Gets diagnostic information (errors, warnings) for a file.
   */
  async getDiagnostics(filePath: string): Promise<Diagnostic[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    // Diagnostics are typically pushed from the server, but some servers
    // support pulling them via a custom request or `textDocument/diagnostic`.
    // This is an example of how you might request them if the server supports it.
    // The standard way is to listen to `textDocument/publishDiagnostics` notifications.
    // For a one-off CLI tool, a request-based approach is simpler if available.
    // We'll simulate a request here.
    try {
      const result = await this.connection.sendRequest<{
        items: Diagnostic[];
      } | null>('textDocument/diagnostic', {
        textDocument: { uri: URI.file(filePath).toString() },
      });
      return result?.items ?? [];
    } catch (e) {
      // This request might fail if the server doesn't support it.
      // A more robust implementation would check server capabilities.
      console.warn('Failed to pull diagnostics:', e);
      return [];
    }
  }

  /**
   * Gets hover information for a symbol at a given position.
   */
  async getHover(filePath: string, position: Position): Promise<Hover | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: HoverParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
    };
    return this.connection.sendRequest<Hover | null>(
      'textDocument/hover',
      params,
    );
  }

  /**
   * Gets the symbols in a document.
   */
  async getDocumentSymbols(
    filePath: string,
  ): Promise<Array<DocumentSymbol | SymbolInformation> | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: DocumentSymbolParams = {
      textDocument: { uri: URI.file(filePath).toString() },
    };
    return this.connection.sendRequest<Array<
      DocumentSymbol | SymbolInformation
    > | null>('textDocument/documentSymbol', params);
  }

  /**
   * Gets symbols from the entire workspace matching a query.
   */
  async getWorkspaceSymbols(
    query: string,
  ): Promise<SymbolInformation[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: WorkspaceSymbolParams = {
      query,
    };
    return this.connection.sendRequest<SymbolInformation[] | null>(
      'workspace/symbol',
      params,
    );
  }

  /**
   * Gets code actions for a given file and range.
   */
  async getCodeActions(
    filePath: string,
    range: Range,
    context: CodeActionContext,
  ): Promise<Array<Command | CodeAction> | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: CodeActionParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      range,
      context,
    };
    return this.connection.sendRequest<Array<Command | CodeAction> | null>(
      'textDocument/codeAction',
      params,
    );
  }

  /**
   * Prepares for a rename operation at a given position.
   */
  async prepareRename(
    filePath: string,
    position: Position,
  ): Promise<Range | { range: Range; placeholder: string } | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: PrepareRenameParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
    };
    return this.connection.sendRequest<
      Range | { range: Range; placeholder: string } | null
    >('textDocument/prepareRename', params);
  }

  /**
   * Renames a symbol at a given position.
   */
  async renameSymbol(
    filePath: string,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: RenameParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
      newName,
    };
    return this.connection.sendRequest<WorkspaceEdit | null>(
      'textDocument/rename',
      params,
    );
  }

  /**
   * Prepares for a call hierarchy request.
   */
  async prepareCallHierarchy(
    filePath: string,
    position: Position,
  ): Promise<CallHierarchyItem[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: CallHierarchyPrepareParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
    };
    return this.connection.sendRequest<CallHierarchyItem[] | null>(
      'textDocument/prepareCallHierarchy',
      params,
    );
  }

  /**
   * Gets incoming calls for a call hierarchy item.
   */
  async getIncomingCalls(
    item: CallHierarchyItem,
  ): Promise<CallHierarchyIncomingCall[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: CallHierarchyIncomingCallsParams = { item };
    return this.connection.sendRequest<CallHierarchyIncomingCall[] | null>(
      'callHierarchy/incomingCalls',
      params,
    );
  }

  /**
   * Gets outgoing calls for a call hierarchy item.
   */
  async getOutgoingCalls(
    item: CallHierarchyItem,
  ): Promise<CallHierarchyOutgoingCall[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: CallHierarchyOutgoingCallsParams = { item };
    return this.connection.sendRequest<CallHierarchyOutgoingCall[] | null>(
      'callHierarchy/outgoingCalls',
      params,
    );
  }

  /**
   * Goes to the implementation of a symbol.
   */
  async goToImplementation(
    filePath: string,
    position: Position,
  ): Promise<Array<Location | LocationLink> | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: ImplementationParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      position,
    };
    return this.connection.sendRequest<Array<Location | LocationLink> | null>(
      'textDocument/implementation',
      params,
    );
  }

  /**
   * Formats a document.
   */
  async formatDocument(
    filePath: string,
    options: FormattingOptions,
  ): Promise<TextEdit[] | null> {
    if (!this.connection) throw new Error('LSP Connection is not running.');

    const params: DocumentFormattingParams = {
      textDocument: { uri: URI.file(filePath).toString() },
      options,
    };
    return this.connection.sendRequest<TextEdit[] | null>(
      'textDocument/formatting',
      params,
    );
  }
}
