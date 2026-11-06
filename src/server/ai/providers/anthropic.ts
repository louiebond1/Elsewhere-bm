import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { z } from 'zod';
import { prototype } from '../../../config/prototype';
import { QUESTION_SYSTEM, EXTRACTION_SYSTEM, FEEDBACK_SYSTEM, MATCHING_SYSTEM, ROLE_SYSTEM } from '../prompts';
import { questionOutput, extractionOutput, feedbackOutput, assessmentOutput, roleStructureOutput } from '../schemas';
import { AiFailure, type AiProvider, type AiResult } from './types';

const MAX_TOKENS = { question: 700, extract: 2000, feedback: 1000, role: 1500, assess: 1500 } as const;

let client: Anthropic | null = null;
function c() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: prototype.aiTimeoutMs, maxRetries: prototype.aiMaxRetries });
  return client;
}

export const cheapModel = () => process.env.AI_CHEAP_MODEL || prototype.aiCheapModel;
export const reviewModel = () => process.env.AI_REVIEW_MODEL || prototype.aiReviewModel;

/** Candidate data is delimited and labelled as untrusted source text, never as instructions. */
const wrap = (label: string, data: unknown) => `<${label}>\n${JSON.stringify(data)}\n</${label}>`;

async function call<S extends z.ZodType>(task: keyof typeof MAX_TOKENS, system: string, user: string, schema: S, model = cheapModel()): Promise<AiResult<z.infer<S>>> {
  try {
    const res = await c().messages.parse({
      model,
      max_tokens: MAX_TOKENS[task],
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { format: zodOutputFormat(schema) },
    });
    const usage = {
      inputTokens: res.usage.input_tokens ?? 0,
      outputTokens: res.usage.output_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
      modelId: model,
    };
    if (res.stop_reason === 'refusal') throw Object.assign(new AiFailure('refused', 'The model declined this request.'), { usage });
    if (!res.parsed_output) throw Object.assign(new AiFailure('schema_contract', 'The model response did not match the schema.'), { usage });
    const parsed = schema.safeParse(res.parsed_output);
    if (!parsed.success) throw Object.assign(new AiFailure('schema_contract', 'The model response failed validation.'), { usage });
    return { output: parsed.data, usage, provider: 'anthropic' };
  } catch (e) {
    if (e instanceof AiFailure) throw e;
    if (e instanceof Anthropic.NotFoundError) throw new AiFailure('model_unavailable', `The configured model ${model} is not available. No other model is substituted.`);
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new AiFailure('auth', 'The AI provider rejected the credentials.');
    if (e instanceof Anthropic.RateLimitError) throw new AiFailure('rate_limited', 'The AI provider is rate limiting requests.', true);
    if (e instanceof Anthropic.APIConnectionTimeoutError) throw new AiFailure('timeout', 'The AI provider timed out.', true);
    if (e instanceof Anthropic.APIConnectionError) throw new AiFailure('network', 'Could not reach the AI provider.', true);
    if (e instanceof Anthropic.APIError) throw new AiFailure('provider_error', 'The AI provider returned an error.', (e.status ?? 0) >= 500);
    throw new AiFailure('unknown', 'Unexpected AI failure.');
  }
}

export const anthropicProvider: AiProvider = {
  name: 'anthropic',
  nextQuestion: (i) => call('question', QUESTION_SYSTEM, `Assigned topic: ${i.topic}\n${wrap('recent_messages', i.recentMessages.slice(-6))}\n${wrap('approved_evidence_summary', i.evidenceSummary)}`, questionOutput),
  extractEvidence: (i) => call('extract', EXTRACTION_SYSTEM, `Allowed tags: see schema.\n${wrap('source_records', i.sources)}`, extractionOutput),
  feedback: (i) => call('feedback', FEEDBACK_SYSTEM, wrap('approved_evidence', i.evidence), feedbackOutput),
  assessCriteria: (i, o) => call('assess', MATCHING_SYSTEM, `${wrap('role_criteria', i.criteria)}\n${wrap('approved_evidence', i.evidence)}`, assessmentOutput, o?.review ? reviewModel() : cheapModel()),
  structureRole: (i) => call('role', ROLE_SYSTEM, wrap('employer_brief', { title: i.title, brief: i.brief }), roleStructureOutput),
};
