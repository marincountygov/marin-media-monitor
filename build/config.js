"use strict";

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const CONFIG_DIR = path.join(__dirname, "..", "config");

function loadSources() {
  const raw = yaml.load(fs.readFileSync(path.join(CONFIG_DIR, "sources.yaml"), "utf8"));
  return raw.sources || [];
}

function loadMonitors() {
  const raw = yaml.load(fs.readFileSync(path.join(CONFIG_DIR, "monitors.yaml"), "utf8"));
  return raw.monitors || [];
}

module.exports = { loadSources, loadMonitors };
