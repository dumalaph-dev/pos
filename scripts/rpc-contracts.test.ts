import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

type RpcContract = readonly (readonly string[])[];

const RPC_CONTRACTS = new Map<string, RpcContract>([
  ["admin_products_top_items", [["p_org_id", "p_from", "p_to", "p_store_id", "p_limit"]]],
  ["admin_sales_period_totals", [["p_org_id", "p_from", "p_to", "p_store_id"]]],
  ["admin_sales_top_items", [["p_org_id", "p_from", "p_to", "p_store_id", "p_limit"]]],
  ["advance_online_order_status", [["p_online_order_id", "p_next_status"]]],
  ["clone_menu", [["source_store", "target_store"]]],
  ["close_shift", [["p_shift_id", "p_declared_cash", "p_note"]]],
  ["complete_online_order", [["p_online_order_id", "p_pos_order_id"]]],
  ["create_platform_operator", [["p_email", "p_role", "p_actor_id", "p_actor_email"]]],
  ["current_stock", [["p_org_id"], ["p_org_id", "p_store_id"]]],
  ["current_inventory_stock", [["p_org_id"], ["p_org_id", "p_store_id"]]],
  ["change_platform_operator_role", [["p_operator_id", "p_role", "p_actor_id", "p_actor_email"]]],
  ["inventory_item_expected_stock", [["p_org_id", "p_store_id", "p_until"]]],
  ["expire_trialing_organization", [["p_org_id"]]],
  ["extend_organization_trial", [["p_org_id", "p_days", "p_reason", "p_actor_id", "p_actor_email"]]],
  ["grant_platform_access", [["p_org_id", "p_days", "p_reason", "p_source", "p_start_mode", "p_actor_id", "p_actor_email"]]],
  ["adjust_platform_access_grant", [["p_grant_id", "p_delta_days", "p_reason", "p_actor_id", "p_actor_email"]]],
  ["inventory_expected_stock", [["p_org_id", "p_store_id", "p_until"]]],
  ["mark_online_order_phone_verified", [["p_online_order_id"]]],
  ["open_shift", [["p_store_id", "p_device_id", "p_opening_cash"]]],
  ["place_online_order", [["p_store_id", "p_request_id", "p_customer_name", "p_customer_phone", "p_fulfillment_method", "p_pickup_slot", "p_pickup_date", "p_delivery_address", "p_delivery_note", "p_note", "p_average_prep_minutes", "p_order_lead_minutes", "p_items", "p_client_ip"]]],
  ["place_order", [["p_order", "p_items"]]],
  ["platform_promotion_performance", [[]]],
  ["qualify_referral_for_paid_conversion", [["p_referred_org_id"]]],
  ["record_inventory_count", [["p_store_id", "p_count_date", "p_counts"], ["p_store_id", "p_count_date", "p_counts", "p_client_mutation_id"]]],
  ["record_inventory_item_count", [["p_store_id", "p_count_date", "p_counts"]]],
  ["record_inventory_item_movement", [["p_store_id", "p_inventory_item_id", "p_type", "p_qty", "p_unit_cost", "p_reason"]]],
  ["record_order_action", [["p_order_id", "p_action", "p_reason"]]],
  ["record_pos_order_void", [["p_order_id", "p_reason", "p_approval_id"]]],
  ["record_stock_movement", [["p_store_id", "p_product_id", "p_type", "p_qty", "p_unit_cost", "p_reason"], ["p_store_id", "p_product_id", "p_type", "p_qty", "p_unit_cost", "p_reason", "p_client_mutation_id"]]],
  ["record_yield_entry", [["p_store_id", "p_source_product_id", "p_source_qty", "p_output_product_id", "p_total_yield_qty", "p_waste_qty", "p_reason"]]],
  ["record_z_reading", [["p_shift_id", "p_note"]]],
  ["revoke_platform_operator", [["p_operator_id", "p_actor_id", "p_actor_email"]]],
  ["save_product_recipe", [["p_product_id", "p_lines"]]],
  ["set_online_availability", [["p_scope", "p_entity_id", "p_available"]]],
  ["set_online_order_status", [["p_online_order_id", "p_next_status", "p_cancel_reason"]]],
  ["set_online_ordering_settings", [["p_store_id", "p_settings"]]],
  ["set_profile_pin", [["p_profile_id", "p_pin"]]],
  ["shift_reading", [["p_shift_id"]]],
  ["shift_reading_list", [["p_store_id", "p_from", "p_to", "p_limit"]]],
  ["verify_admin_pin", [["p_pin"]]],
  ["verify_online_order_phone", [["p_online_order_id", "p_verification_id", "p_code"]]],
  ["verify_void_pin", [["p_order_id", "p_pin"]]],
]);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [fullPath] : [];
  });
}

function readRpcCalls() {
  const calls: Array<{ file: string; line: number; name: string; keys: string[] }> = [];
  for (const file of sourceFiles(path.resolve(process.cwd(), "src"))) {
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "rpc") {
        const nameNode = node.arguments[0];
        if (nameNode && ts.isStringLiteral(nameNode)) {
          const payload = node.arguments[1];
          const keys = payload && ts.isObjectLiteralExpression(payload)
            ? payload.properties.flatMap((property) => {
              if (!ts.isPropertyAssignment(property)) return [];
              const propertyName = property.name;
              return ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName) ? [propertyName.text] : [];
            })
            : [];
          calls.push({
            file: path.relative(process.cwd(), file),
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
            name: nameNode.text,
            keys,
          });
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }
  return calls;
}

test("Supabase RPC call payloads match the known database contracts", () => {
  const errors: string[] = [];
  for (const call of readRpcCalls()) {
    const contracts = RPC_CONTRACTS.get(call.name);
    if (!contracts) {
      errors.push(`${call.file}:${call.line} calls unknown RPC ${call.name}`);
      continue;
    }

    const actual = [...new Set(call.keys)].sort();
    const matches = contracts.some((contract) => JSON.stringify([...contract].sort()) === JSON.stringify(actual));
    if (!matches) errors.push(`${call.file}:${call.line} ${call.name} payload {${actual.join(", ")}} does not match a known signature`);
  }

  assert.equal(errors.length, 0, errors.join("\n"));
});

test("online-ordering migrations explicitly reload PostgREST after RPC DDL", () => {
  for (const migration of ["0064_rpc_contract_hardening.sql", "0065_rpc_acl_normalization.sql", "0066_service_rpc_acl_fix.sql"]) {
    const contents = fs.readFileSync(path.resolve(process.cwd(), "supabase", "migrations", migration), "utf8");
    assert.match(contents, /notify\s+pgrst,\s*'reload schema'/i, `${migration} must reload the PostgREST schema cache`);
  }
});

const PLATFORM_ACTION_CONTRACTS = new Map<string, Map<string, string>>([
  ["src/app/platform/actions.ts", new Map([
    ["saveBillingCatalog", "billing_manage"],
    ["savePlatformPolicy", "policy_manage"],
    ["savePlatformPromotion", "billing_manage"],
    ["togglePlatformPromotion", "billing_manage"],
  ])],
  ["src/app/platform/operations-actions.ts", new Map([
    ["suspendOrganization", "support_manage"],
    ["restoreOrganization", "support_manage"],
    ["openSupportCase", "support_manage"],
    ["grantComplimentaryPremium", "entitlement_manage"],
    ["adjustComplimentaryPremium", "entitlement_manage"],
    ["revokeComplimentaryPremium", "entitlement_manage"],
    ["extendOrganizationTrial", "entitlement_manage"],
    ["updateTrialFeedback", "support_manage"],
  ])],
  ["src/app/platform/operators-actions.ts", new Map([
    ["invitePlatformOperator", "operator_manage"],
    ["changePlatformOperatorRole", "operator_manage"],
    ["revokePlatformOperator", "operator_manage"],
  ])],
]);

function readPlatformActionPermissionChecks() {
  const checks: Array<{ file: string; functionName: string; permission: string | null }> = [];
  for (const [relativeFile, expectedActions] of PLATFORM_ACTION_CONTRACTS) {
    const file = path.resolve(process.cwd(), relativeFile);
    const sourceText = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      if (!ts.isFunctionDeclaration(statement) || !statement.name || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (!expectedActions.has(statement.name.text)) continue;
      let permission: string | null = null;
      function visit(node: ts.Node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "requirePlatformOperator") {
          const argument = node.arguments[0];
          if (argument && ts.isStringLiteral(argument)) permission = argument.text;
        }
        ts.forEachChild(node, visit);
      }
      if (statement.body) visit(statement.body);
      checks.push({ file: relativeFile, functionName: statement.name.text, permission });
    }
  }
  return checks;
}

test("every exported platform Server Action performs its required centralized role check", () => {
  const checks = readPlatformActionPermissionChecks();
  const errors: string[] = [];
  for (const [file, expectedActions] of PLATFORM_ACTION_CONTRACTS) {
    for (const [functionName, expectedPermission] of expectedActions) {
      const check = checks.find((candidate) => candidate.file === file && candidate.functionName === functionName);
      if (!check) errors.push(`${file} is missing exported action ${functionName}`);
      else if (check.permission !== expectedPermission) errors.push(`${file}:${functionName} checks ${check.permission ?? "nothing"}; expected ${expectedPermission}`);
    }
  }
  assert.equal(errors.length, 0, errors.join("\n"));
});
