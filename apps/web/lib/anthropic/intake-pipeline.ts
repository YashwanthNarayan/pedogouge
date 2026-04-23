import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { call } from "./client";
import { assembleSystemPrompt } from "./system-prompt";
import { generateCanary } from "./canary";
import { Models } from "./models";
import { ProjectBlueprint } from "@pedagogue/shared/schemas";

// ---------------------------------------------------------------------------
// Specialist output schemas — each tool produces structured data
// ---------------------------------------------------------------------------
const ArchitectOutput = z.object({
  features: ProjectBlueprint.shape.features,
  dataModels: ProjectBlueprint.shape.dataModels,
  apiSurface: ProjectBlueprint.shape.apiSurface,
  starterRepo: ProjectBlueprint.shape.starterRepo,
});

const PedagogueOutput = z.object({
  conceptGraph: ProjectBlueprint.shape.conceptGraph,
  ambiguities: ProjectBlueprint.shape.ambiguities,
  recommendedLanguage: ProjectBlueprint.shape.recommendedLanguage,
});

const ScoperOutput = z.object({
  scopedMvp: ProjectBlueprint.shape.scopedMvp,
  summary: ProjectBlueprint.shape.summary,
});

type ArchitectOutput = z.infer<typeof ArchitectOutput>;
type PedagogueOutput = z.infer<typeof PedagogueOutput>;
type ScoperOutput = z.infer<typeof ScoperOutput>;

// ---------------------------------------------------------------------------
// Tool definitions for the parallel intake call
// ---------------------------------------------------------------------------
const intakeTools: Anthropic.Tool[] = [
  {
    name: "architect",
    description:
      "Decompose the project idea into features, data models, API surface, and a starter-repo scaffold. Focus on technical design.",
    input_schema: {
      type: "object",
      properties: {
        projectIdea: { type: "string", description: "The raw project idea to analyze" },
      },
      required: ["projectIdea"],
    },
  },
  {
    name: "pedagogue",
    description:
      "Map the project idea to CS concepts, prerequisite graph, and educational considerations. Identify what the student needs to learn.",
    input_schema: {
      type: "object",
      properties: {
        projectIdea: { type: "string", description: "The raw project idea to analyze" },
      },
      required: ["projectIdea"],
    },
  },
  {
    name: "scoper",
    description:
      "Estimate the complexity and define the MVP scope for a 5-day hackathon timeline. Ruthlessly cut to the essentials.",
    input_schema: {
      type: "object",
      properties: {
        projectIdea: { type: "string", description: "The raw project idea to scope" },
      },
      required: ["projectIdea"],
    },
  },
];

// ---------------------------------------------------------------------------
// Specialist system prompts
// ---------------------------------------------------------------------------
const specialistPrompts: Record<string, string> = {
  architect: `You are a software architect analyzing a student's project idea. Produce a concrete, implementable design with specific features, data models, API surface, and a minimal starter-repo file scaffold. Keep the starter repo to 3–5 files maximum. Make it immediately runnable.`,
  pedagogue: `You are a CS pedagogy expert. Given a project idea, identify the CS concepts the student will encounter (e.g., loops, functions, recursion, data structures, async). Map prerequisites between concepts. Identify ambiguities where the student's understanding might be weak. Suggest the best language for a high-school learner to implement this project.`,
  scoper: `You are a ruthless product scoper. Given a project idea, define the MVP that can be implemented by a high-school student in 5 days. Select only the core user-facing features. Write a compelling 1-sentence summary of the project.`,
};

// ---------------------------------------------------------------------------
// Run a specialist model for a given tool use
// ---------------------------------------------------------------------------
async function runSpecialist(
  toolName: string,
  input: Record<string, unknown>,
): Promise<ArchitectOutput | PedagogueOutput | ScoperOutput> {
  const model: "opus" | "sonnet" | "haiku" =
    toolName === "scoper" ? "haiku" : toolName === "pedagogue" ? "sonnet" : "opus";
  const outputSchema =
    toolName === "architect" ? ArchitectOutput : toolName === "pedagogue" ? PedagogueOutput : ScoperOutput;

  const result = await call({
    model,
    system: assembleSystemPrompt({
      role: toolName,
      canary: generateCanary(),
      extra: specialistPrompts[toolName],
    }),
    messages: [
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ],
    output_schema: outputSchema,
    max_tokens: 4096,
    temperature: 0.3,
  });

  return result.parsed as unknown as ArchitectOutput | PedagogueOutput | ScoperOutput;
}

// ---------------------------------------------------------------------------
// Main intake pipeline: 1 parallel fan-out call + 1 synthesis call
// ---------------------------------------------------------------------------
export async function runIntake(projectIdea: string): Promise<z.infer<typeof ProjectBlueprint>> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
  });

  // Call 1: Opus fans out to all 3 tools in parallel
  const r1 = await client.messages.create({
    model: Models.opus,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: `You are coordinating a multi-agent analysis of a student's project idea. Call all three tools (architect, pedagogue, scoper) in parallel now. Do not answer with prose — just call the tools.`,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: intakeTools,
    tool_choice: { type: "any" },
    messages: [
      {
        role: "user",
        content: `<user_input>${projectIdea}</user_input>`,
      },
    ],
    // @ts-expect-error beta header — omitted in proxy mode
    ...(process.env.ANTHROPIC_BASE_URL ? {} : { betas: ["output-300k-2026-03-24"] }),
  });

  // Extract the 3 tool_use blocks
  const toolUses = r1.content.filter(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  if (toolUses.length !== 3) {
    throw new Error(`Expected 3 parallel tool uses (architect, pedagogue, scoper), got ${toolUses.length}`);
  }

  // Run specialists in parallel
  const specialistResults = await Promise.all(
    toolUses.map((tu) => runSpecialist(tu.name, tu.input as Record<string, unknown>)),
  );

  // Build tool results for the synthesis call
  const toolResults = toolUses.map((tu, i) => ({
    type: "tool_result" as const,
    tool_use_id: tu.id,
    content: JSON.stringify(specialistResults[i]),
  }));

  // Merge specialist outputs into a coherent blueprint for synthesis
  const merged = Object.assign({}, ...specialistResults) as Record<string, unknown>;

  // Call 2: Opus synthesizes all tool results into a ProjectBlueprint (cache hit on system)
  const synthesis = await call<z.infer<typeof ProjectBlueprint>>({
    model: "opus",
    system: assembleSystemPrompt({
      role: "blueprint-synthesizer",
      canary: generateCanary(),
      extra: `Synthesize the outputs from architect, pedagogue, and scoper into a single cohesive ProjectBlueprint. Ensure concept IDs in features match those in conceptGraph. Ensure the starterRepo files are consistent with the features.`,
    }),
    messages: [
      {
        role: "user",
        content: `<user_input>Project idea: ${projectIdea}</user_input>`,
      },
      {
        role: "assistant",
        content: r1.content,
      },
      {
        role: "user",
        content: toolResults,
      },
    ],
    output_schema: ProjectBlueprint,
    max_tokens: 8192,
    temperature: 0.2,
  });

  void merged; // specialists already passed through synthesis
  return synthesis.parsed;
}
