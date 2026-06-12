import cors from "cors";

export const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "https://test.reparv.in",
  "https://admin.reparv.in",
  "https://reparv.in",
  "https://www.reparv.in",
  "https://users.reparv.in",
  "https://builder.reparv.in",
  "https://employee.reparv.in",
  "https://promoter.reparv.in",
  "https://partners.reparv.in",
  "https://onboarding.reparv.in",
  "https://sales.reparv.in",
  "https://projectpartner.reparv.in",
  "https://territory.reparv.in",
  "https://business.reparv.in",
];

function originChecker(logPrefix) {
  return function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(logPrefix, origin);
      callback(new Error("Not allowed by CORS"));
    }
  };
}

const corsBase = {
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
};

/** Attaches main CORS middleware and OPTIONS preflight handler. */
export function attachCors(app) {
  app.use(
    cors({
      ...corsBase,
      origin: originChecker("Blocked by CORS:"),
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );
  app.options(
    "*",
    cors({
      ...corsBase,
      origin: originChecker("Blocked by CORS (OPTIONS):"),
    }),
  );
}
