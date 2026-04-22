import { zodToJsonSchema } from "zod-to-json-schema";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { ProjectBlueprint } from "../src/schemas/project-blueprint.js";
import { ConceptNode } from "../src/schemas/concept-node.js";
import { ASTDiagnostic } from "../src/schemas/ast-diagnostic.js";
import { InterventionDecision } from "../src/schemas/intervention-decision.js";
import { InterviewContext } from "../src/schemas/interview-context.js";
import { VerifiableCredentialSubject } from "../src/schemas/verifiable-credential-subject.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../src/json-schema");
mkdirSync(outDir, { recursive: true });

const schemas: Array<{ name: string; schema: unknown }> = [
  { name: "ProjectBlueprint", schema: ProjectBlueprint },
  { name: "ConceptNode", schema: ConceptNode },
  { name: "ASTDiagnostic", schema: ASTDiagnostic },
  { name: "InterventionDecision", schema: InterventionDecision },
  { name: "InterviewContext", schema: InterviewContext },
  { name: "VerifiableCredentialSubject", schema: VerifiableCredentialSubject },
];

for (const { name, schema } of schemas) {
  const json = zodToJsonSchema(schema as Parameters<typeof zodToJsonSchema>[0], {
    name,
    target: "jsonSchema7",
  });
  const outPath = join(outDir, `${name}.json`);
  writeFileSync(outPath, JSON.stringify(json, null, 2) + "\n");
  console.log(`Generated ${outPath}`);
}

console.log(`\nGenerated ${schemas.length} JSON schemas to ${outDir}`);
