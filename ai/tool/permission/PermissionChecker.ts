import type { ToolContext, ToolPermission } from "../types";

/**
 * Access control validator checking engine scopes and user credentials.
 */
export class PermissionChecker {
  /**
   * Evaluates if the current tool execution context satisfies security credentials.
   *
   * @param permission Tool permissions configuration.
   * @param context    Current tool invocation context (contains user context info).
   * @param resourceOwnerId Optional ID of the owner of the resource being modified.
   */
  static isAllowed(
    permission: ToolPermission,
    context: ToolContext,
    resourceOwnerId?: string | undefined
  ): boolean {
    // 1. Validate Scope permissions
    const scopeAllowed =
      permission.allowedScopes === "*" ||
      permission.allowedScopes.includes(context.scope);

    if (!scopeAllowed) {
      return false;
    }

    // 2. Validate Role permissions
    const requiredRole = permission.requiredRole;

    if (requiredRole === "public") {
      return true;
    }

    const userId = context.user?.id;
    const userRole = context.user?.role;

    if (!userId) {
      return false; // Authentication is required for non-public tools
    }

    if (requiredRole === "authenticated") {
      return true;
    }

    if (requiredRole === "admin") {
      return userRole === "admin";
    }

    if (requiredRole === "owner") {
      if (userRole === "admin") return true; // Admins override resource ownership checks
      if (!resourceOwnerId) return false; // Cannot verify ownership
      return userId === resourceOwnerId;
    }

    // Support future custom role extensions dynamically
    return userRole === requiredRole;
  }
}
