/**
 * ai/prompt/templates/writer.prompts.js
 *
 * Responsibility:
 *   All prompts owned by the WriterAgent.
 *
 *   Exports:
 *   WRITE_SECTION   — given an outline node + tone, write the section body
 *   WRITE_INTRO     — given article title + key points, write an introduction
 *   WRITE_CONCLUSION — given article body, write a conclusion
 *   CONTINUE_WRITING — given partial content + cursor context, continue the text
 *
 * Why it exists:
 *   Grouping prompts by domain agent keeps them discoverable and makes it
 *   clear who owns each prompt. Changes to WriterAgent prompts happen here
 *   and nowhere else.
 */
