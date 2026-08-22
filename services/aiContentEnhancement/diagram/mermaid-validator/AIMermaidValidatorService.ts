/**
 * AIMermaidValidatorService.ts
 *
 * Validates Mermaid diagram code syntax, structure, limits, and safety.
 * OpenIdear AI Content Enhancement System - Sprint 3
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedCode?: string;
}

export interface MermaidValidationOptions {
  maxLines?: number;
  maxCharacters?: number;
  maxNodes?: number;
  strictHeader?: boolean;
}

export const SUPPORTED_DIAGRAM_KEYWORDS = [
  'flowchart',
  'graph',
  'sequencediagram',
  'statediagram-v2',
  'statediagram',
  'erdiagram',
  'classdiagram',
] as const;

export type SupportedDiagramKeyword = (typeof SUPPORTED_DIAGRAM_KEYWORDS)[number];

const PROHIBITED_DIRECTIVES_REGEX = /click\s+[\w\-]+\s+href\s+["']?javascript:/i;
const HTML_INJECTION_REGEX = /<\s*(script|iframe|object|embed|style|link|meta)[\s>\/]/i;

export class AIMermaidValidatorService {
  private defaultOptions: Required<MermaidValidationOptions> = {
    maxLines: 60,
    maxCharacters: 4000,
    maxNodes: 25,
    strictHeader: true,
  };

  /**
   * Main validation entry point.
   * Performs structural, syntax, bounds, security, and delimiter checks.
   */
  public validate(code: string, options: MermaidValidationOptions = {}): ValidationResult {
    const opts: Required<MermaidValidationOptions> = {
      ...this.defaultOptions,
      ...options,
    };

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!code || typeof code !== 'string' || !code.trim()) {
      return {
        valid: false,
        errors: ['Mermaid code input is empty or null.'],
        warnings: [],
      };
    }

    // 1. Fenced Code Block Validation & Extraction
    const cleanCode = this.extractCodeFromFences(code, errors, warnings);

    // 2. Character & Line Length Bounds
    if (cleanCode.length > opts.maxCharacters) {
      errors.push(
        `Diagram character count (${cleanCode.length}) exceeds limit of ${opts.maxCharacters}.`
      );
    }

    const lines = cleanCode
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('%%')); // ignore comments

    if (lines.length > opts.maxLines) {
      errors.push(
        `Diagram line count (${lines.length}) exceeds maximum limit of ${opts.maxLines}.`
      );
    }

    if (lines.length === 0) {
      errors.push('Mermaid code contains no valid content lines after trimming comments.');
      return { valid: false, errors, warnings };
    }

    // 3. Diagram Keyword Check
    const firstLine = lines[0];
    const firstWord = firstLine.split(/\s+/)[0].toLowerCase();

    if (!SUPPORTED_DIAGRAM_KEYWORDS.includes(firstWord as SupportedDiagramKeyword)) {
      errors.push(
        `Unsupported or missing diagram directive header '${firstWord}'. Supported types: [${SUPPORTED_DIAGRAM_KEYWORDS.join(
          ', '
        )}]`
      );
    }

    // 4. Prohibited & Dangerous Directives Security Check
    const securityViolations = this.detectProhibitedDirectives(cleanCode);
    if (securityViolations.length > 0) {
      errors.push(...securityViolations);
    }

    // 5. Balanced Delimiters & Quotes Check
    const delimiterErrors = this.checkBalancedDelimiters(cleanCode);
    if (delimiterErrors.length > 0) {
      errors.push(...delimiterErrors);
    }

    // 6. Arrow & Connection Syntax Checks
    const connectionWarnings = this.validateConnections(cleanCode);
    if (connectionWarnings.length > 0) {
      warnings.push(...connectionWarnings);
    }

    // 7. Node Count Limit Check
    const nodeCount = this.estimateNodeCount(cleanCode);
    if (nodeCount > opts.maxNodes) {
      warnings.push(
        `Estimated node count (${nodeCount}) exceeds recommended maximum of ${opts.maxNodes}.`
      );
    }

    // 8. Node Label Sanitization
    const sanitizedCode = this.sanitizeNodeLabels(cleanCode);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedCode,
    };
  }

  /**
   * Extracts clean raw Mermaid syntax from markdown code fences if present.
   */
  public extractCodeFromFences(
    rawInput: string,
    errors: string[],
    warnings: string[]
  ): string {
    let text = rawInput.trim();

    const hasOpeningFence = text.startsWith('```mermaid') || text.startsWith('```');
    const hasClosingFence = text.endsWith('```');

    if (hasOpeningFence && !hasClosingFence) {
      errors.push("Malformed fenced block: opening '```' found without matching closing '```'.");
    } else if (!hasOpeningFence && hasClosingFence) {
      warnings.push("Unmatched closing '```' fence found without opening fence.");
    }

    text = text.replace(/^```(mermaid)?/i, '').replace(/```$/, '').trim();
    return text;
  }

  /**
   * Scans for XSS, unsafe HTML tags, and forbidden execution directives in Mermaid syntax.
   */
  public detectProhibitedDirectives(code: string): string[] {
    const violations: string[] = [];

    if (PROHIBITED_DIRECTIVES_REGEX.test(code)) {
      violations.push("Security violation: 'javascript:' link directive is strictly prohibited.");
    }

    if (HTML_INJECTION_REGEX.test(code)) {
      violations.push('Security violation: Embedded HTML tags (<script>, <iframe>, <style>) are prohibited.');
    }

    return violations;
  }

  /**
   * Checks for balanced brackets, parentheses, braces, and double quotes.
   */
  public checkBalancedDelimiters(code: string): string[] {
    const errors: string[] = [];
    const counts = {
      squareOpen: 0,
      squareClose: 0,
      parenOpen: 0,
      parenClose: 0,
      curlyOpen: 0,
      curlyClose: 0,
      doubleQuotes: 0,
    };

    let isEscaped = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (char === '\\') {
        isEscaped = !isEscaped;
        continue;
      }

      if (!isEscaped) {
        if (char === '[') counts.squareOpen++;
        else if (char === ']') counts.squareClose++;
        else if (char === '(') counts.parenOpen++;
        else if (char === ')') counts.parenClose++;
        else if (char === '{') counts.curlyOpen++;
        else if (char === '}') counts.curlyClose++;
        else if (char === '"') counts.doubleQuotes++;
      }

      isEscaped = false;
    }

    if (counts.squareOpen !== counts.squareClose) {
      errors.push(`Unbalanced square brackets: ${counts.squareOpen} '[' vs ${counts.squareClose} ']'`);
    }
    if (counts.parenOpen !== counts.parenClose) {
      errors.push(`Unbalanced parentheses: ${counts.parenOpen} '(' vs ${counts.parenClose} ')'`);
    }
    if (counts.curlyOpen !== counts.curlyClose) {
      errors.push(`Unbalanced curly braces: ${counts.curlyOpen} '{' vs ${counts.curlyClose} '}'`);
    }
    if (counts.doubleQuotes % 2 !== 0) {
      errors.push(`Unbalanced double quotes: total of ${counts.doubleQuotes} quotes found.`);
    }

    return errors;
  }

  /**
   * Validates connection syntax and warns about potential syntax typos in arrows.
   */
  public validateConnections(code: string): string[] {
    const warnings: string[] = [];
    // Check for malformed arrows like ---> or ===>
    const invalidArrows = code.match(/--->|===>|-\.->>/g);
    if (invalidArrows) {
      warnings.push(`Potential malformed arrow syntax found: [${Array.from(new Set(invalidArrows)).join(', ')}]`);
    }
    return warnings;
  }

  /**
   * Estimates unique node definitions in a diagram.
   */
  public estimateNodeCount(code: string): number {
    const matches = code.match(/\b[A-Za-z0-9_]+(?=\s*(?:\[|\(|\{|\-\->|\=\=>|\.->|\-\->>))/g);
    if (!matches) return 0;

    const keywords = [
      ...SUPPORTED_DIAGRAM_KEYWORDS,
      'td',
      'lr',
      'rl',
      'bt',
      'tb',
      'subgraph',
      'end',
      'autonumber',
      'participant',
      'actor',
      'class',
      'style',
    ];

    const uniqueNodes = new Set(
      matches
        .map((m) => m.toLowerCase())
        .filter((m) => !keywords.includes(m))
    );

    return uniqueNodes.size;
  }

  /**
   * Sanitizes node label text by stripping unsafe HTML or illegal escape characters.
   */
  public sanitizeNodeLabels(code: string): string {
    return code
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/javascript:/gi, '');
  }
}

export const mermaidValidatorService = new AIMermaidValidatorService();
