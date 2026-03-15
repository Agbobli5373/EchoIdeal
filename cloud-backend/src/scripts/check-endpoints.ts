/**
 * Check licensing and API endpoints with a license key.
 * Usage (server must be running):
 *   BASE_URL=http://127.0.0.1:8787 API_ACCESS_KEY=your_key LICENSE_KEY=EI-XXXX-XXXX node dist/src/scripts/check-endpoints.js
 * Or: node dist/src/scripts/check-endpoints.js http://127.0.0.1:8787 your_api_key EI-CTQS-454V-MC3E-NV9W-VL7L
 */

const BASE_URL =
  process.env.BASE_URL ?? process.argv[2] ?? "http://127.0.0.1:8787";
const API_ACCESS_KEY =
  process.env.API_ACCESS_KEY ?? process.argv[3] ?? "";
const LICENSE_KEY =
  process.env.LICENSE_KEY ?? process.argv[4] ?? "";

const instanceName = `check-${Date.now()}`;
const machineId = "check-machine-1";
const appVersion = "1.0.0";

async function main() {
  if (!API_ACCESS_KEY) {
    console.error("Set API_ACCESS_KEY env or pass as second argument");
    process.exit(1);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${API_ACCESS_KEY}`,
  };

  console.log("Checking health...");
  const healthRes = await fetch(`${BASE_URL}/health`);
  if (!healthRes.ok) {
    console.error("Health check failed:", healthRes.status, await healthRes.text());
    process.exit(1);
  }
  console.log("Health OK\n");

  console.log("POST /activate with license key:", LICENSE_KEY);
  const activateRes = await fetch(`${BASE_URL}/activate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      license_key: LICENSE_KEY,
      instance_name: instanceName,
      machine_id: machineId,
      app_version: appVersion,
    }),
  });
  const activateJson = (await activateRes.json().catch(() => ({}))) as {
    activated?: boolean;
    instance?: { id: string };
    error?: string;
    is_dev_license?: boolean;
  };
  console.log("  Status:", activateRes.status);
  console.log("  Body:", JSON.stringify(activateJson, null, 2));

  if (!activateJson.activated || !activateJson.instance) {
    console.log("\nActivation failed or license invalid/inactive. Cannot test /api/response.");
    process.exit(activateRes.ok ? 0 : 1);
  }

  console.log("\nPOST /validate");
  const validateRes = await fetch(`${BASE_URL}/validate`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      license_key: LICENSE_KEY,
      instance_name: instanceName,
      machine_id: machineId,
      app_version: appVersion,
    }),
  });
  const validateJson = (await validateRes.json().catch(() => ({}))) as {
    is_active?: boolean;
  };
  console.log("  Status:", validateRes.status);
  console.log("  is_active:", validateJson.is_active);

  console.log("\nGET /api/response");
  const responseRes = await fetch(`${BASE_URL}/api/response`, {
    method: "GET",
    headers: {
      ...headers,
      license_key: LICENSE_KEY,
      instance: instanceName,
      machine_id: machineId,
    },
  });
  const responseJson = (await responseRes.json().catch(() => ({}))) as {
    url?: string;
    model?: string;
    user_token?: string;
    error?: string;
  };
  console.log("  Status:", responseRes.status);
  if (responseRes.ok) {
    console.log("  url:", responseJson.url);
    console.log("  model:", responseJson.model);
    console.log("  user_token length:", responseJson.user_token?.length ?? 0);
  } else {
    console.log("  error:", responseJson.error);
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
