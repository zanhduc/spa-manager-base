import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import https from "https";
import http from "http";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gasUrl = env.VITE_GAS_WEBAPP_URL || "";

  return {
    esbuild: {
      charset: "utf8",
    },
    plugins: [
      react(),
      viteSingleFile(),
      {
        name: "gas-proxy",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url.startsWith("/gas-proxy")) return next();

            const q = req.url.indexOf("?");
            const qs = q !== -1 ? req.url.slice(q) : "";
            const target = gasUrl + qs;
            // console.log("[gas-proxy] →", target);

            function doReq(url) {
              const mod = url.startsWith("https") ? https : http;
              mod
                .get(url, (pres) => {
                  if (
                    [301, 302, 303].includes(pres.statusCode) &&
                    pres.headers.location
                  ) {
                    return doReq(pres.headers.location);
                  }
                  // Buffer toàn bộ response để log debug
                  const chunks = [];
                  pres.on("data", (c) => chunks.push(c));
                  pres.on("end", () => {
                    const body = Buffer.concat(chunks).toString();
                    // console.log("[gas-proxy] status:", pres.statusCode, "| body:", body.slice(0, 300));
                    res.setHeader("Content-Type", "application/json");
                    res.setHeader("Access-Control-Allow-Origin", "*");
                    res.statusCode = 200; // luôn trả 200 để client xử lý nội dung
                    res.end(body);
                  });
                })
                .on("error", (e) => {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: e.message }));
                });
            }

            doReq(target);
          });
        },
      },
    ],
    build: {
      outDir: "dist",
      emptyOutDir: true,
      modulePreload: false,
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      minify: "esbuild",
    },
  };
});
