declare module "virtual:sites-connector-preview" {
  const binding: import("./connector-contract.mjs").ConnectorBinding;
  export default binding;
}

// Only the local preview uses an environment binding. Hosted Sites receive the
// request-scoped capability through ctx.props.CONNECTORS in sites-worker.ts.
declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    CONNECTORS?: import("./connector-contract.mjs").ConnectorBinding;
  }
}
