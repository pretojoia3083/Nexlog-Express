const https = require("https");
const fs = require("fs");
const path = require("path");

const TOKEN = "vcp_29CpYjJrWd3QgSN1dEazJAuMsFHzsnyZvwYBaW9YGxMLYjqPIH0eKpIU";
const TEAM = "rotaflex";
const PROJECT_ID = "prj_cDaFfFzLMJcxRuoFB2FJLv0Qxb9w";
const BASE = "C:\\Users\\Renato\\OneDrive\\Desktop\\nexlog";
const SKIP = ["node_modules", ".next", ".git", "deploy.js"];

function getFiles(dir, prefix) {
  prefix = prefix || "";
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.indexOf(entry.name) !== -1) continue;
    const full = path.join(dir, entry.name);
    const rel = prefix ? prefix + "/" + entry.name : entry.name;
    if (entry.isDirectory()) {
      results.push.apply(results, getFiles(full, rel));
    } else {
      const data = fs.readFileSync(full);
      results.push({ file: rel, data: data.toString("base64"), encoding: "base64" });
    }
  }
  return results;
}

async function createProject() {
  return new Promise(function(resolve) {
    const body = JSON.stringify({ name: "nexlog-express" });
    const req = https.request({
      hostname: "api.vercel.com",
      path: "/v10/projects?teamId=" + TEAM,
      method: "POST",
      headers: { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        var json = JSON.parse(data);
        console.log("Project:", json.id || json.name || JSON.stringify(json));
        resolve(json);
      });
    });
    req.on("error", function(e) { console.log("Error:", e.message); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function deploy(projectId) {
  const files = getFiles(BASE);
  console.log("Uploading " + files.length + " files...");
  const body = JSON.stringify({ name: "nexlog-express", project: projectId, target: "production", files: files, projectSettings: { framework: "nextjs", buildCommand: "rm -rf .next && next build", devCommand: "next dev", installCommand: "rm -rf node_modules && npm install" } });

  return new Promise(function(resolve) {
    const req = https.request({
      hostname: "api.vercel.com",
      path: "/v13/deployments",
      method: "POST",
      headers: { "Authorization": "Bearer " + TOKEN, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }
    }, function(res) {
      var data = "";
      res.on("data", function(chunk) { data += chunk; });
      res.on("end", function() {
        var json = JSON.parse(data);
        if (json.id) {
          console.log("Deployed! URL: https://" + json.url);
        } else {
          console.log("Error:", JSON.stringify(json));
        }
        resolve(json);
      });
    });
    req.on("error", function(e) { console.log("Error:", e.message); resolve(null); });
    req.write(body);
    req.end();
  });
}

async function main() {
  await deploy(PROJECT_ID);
}

main();
