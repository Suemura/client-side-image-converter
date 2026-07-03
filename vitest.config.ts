import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ブラウザAPI（File / FileReader / localStorage など）を使うため happy-dom を使用
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    // tsconfig.json のパスエイリアスと同期させること
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
      "@utils": path.resolve(__dirname, "src/utils"),
    },
  },
});
