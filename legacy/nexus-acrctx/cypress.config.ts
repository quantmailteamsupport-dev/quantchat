import { defineConfig } from "cypress";

export default defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  chromeWebSecurity: false,
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    env: {
      wsUrl: "http://localhost:4000",
      virtualUsers: 50,
      signalsPerUser: 5,
      maxSignalLatencyMs: 300,
      minSuccessRate: 0.99,
    },
    setupNodeEvents(on) {
      on("task", {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
});
