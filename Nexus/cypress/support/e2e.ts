// Intentionally minimal support bootstrap for load-oriented specs.

Cypress.on("uncaught:exception", (err) => {
  if (err.message.includes("ResizeObserver loop limit exceeded")) {
    return false;
  }
  return true;
});
