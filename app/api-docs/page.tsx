// app/api-docs/page.tsx
// Documentação interativa da API pública (Swagger UI)
// Acesse em: /api-docs

export const metadata = {
  title: "API Docs — Playbook Hub",
  description: "Documentação interativa da API REST pública do Playbook Hub.",
};

export default function ApiDocsPage() {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      </head>
      <body style={{ margin: 0 }}>
        <div id="swagger-ui" />
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onload = () => {
                SwaggerUIBundle({
                  url: '/api-docs/openapi.json',
                  dom_id: '#swagger-ui',
                  presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
                  layout: 'BaseLayout',
                  deepLinking: true,
                  tryItOutEnabled: true,
                });
              };
            `,
          }}
        />
      </body>
    </html>
  );
}
