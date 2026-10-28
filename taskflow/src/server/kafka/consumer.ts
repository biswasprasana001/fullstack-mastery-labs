// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW Q: "How do Kafka topics, partitions, offsets, and consumer groups work?"
// INTERVIEW Q: "Why is ordering only guaranteed within a partition?"
// ─────────────────────────────────────────────────────────────────────────────

import { Kafka, Consumer, EachMessagePayload } from "kafkajs";

// ─── Kafka concepts ──────────────────────────────────────────────────────────
//
//  Topic      → a named stream of messages (e.g. "task-events")
//  Partition  → a topic is split into N ordered, append-only logs
//  Offset     → the position of a message within a partition (monotonically increasing)
//  Consumer Group → a group of consumers that collectively read a topic.
//               Each partition is assigned to exactly ONE consumer in the group.
//               Kafka tracks the committed offset per group per partition.
//
// Why ordering is per-partition, not per-topic:
//   Partition 0: msg1, msg2, msg4
//   Partition 1: msg3, msg5
//   Consumer A reads partition 0 in order. Consumer B reads partition 1 in order.
//   But across partitions, there's no global order guarantee.
//
// How to guarantee order for related messages (e.g. all events for task #42):
//   Use task_id as the partition key → all task #42 events go to the same partition.

const kafka = new Kafka({
  clientId: "taskflow",
  brokers: [process.env["KAFKA_BROKER"] ?? "localhost:9092"],
});

export const producer = kafka.producer();

// Send a task event — partition key = taskId ensures ordering per task
export async function publishTaskEvent(
  taskId: number,
  event: "created" | "updated" | "deleted",
  payload: unknown
): Promise<void> {
  await producer.send({
    topic: "task-events",
    messages: [
      {
        key: String(taskId),     // partition key — same taskId → same partition
        value: JSON.stringify({ event, taskId, payload, ts: Date.now() }),
      },
    ],
  });
}

// ─── Consumer ────────────────────────────────────────────────────────────────

let consumer: Consumer | null = null;

export async function startConsumer(): Promise<void> {
  consumer = kafka.consumer({ groupId: "taskflow-workers" });

  await consumer.connect();

  // Subscribe to the topic — fromBeginning: false means start from new messages
  await consumer.subscribe({ topic: "task-events", fromBeginning: false });

  await consumer.run({
    // eachMessage: process one message at a time, in order within the partition
    eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
      const raw = message.value?.toString();
      if (!raw) return;

      const { event, taskId, payload } = JSON.parse(raw) as {
        event: string;
        taskId: number;
        payload: unknown;
      };

      console.log(`[Kafka] partition=${partition} offset=${message.offset} event=${event} taskId=${taskId}`);

      // ─── At-least-once delivery ────────────────────────────────────────
      // KafkaJS commits offsets AFTER eachMessage returns without error.
      // If the process crashes mid-handler, the message is re-delivered.
      // → Make handlers IDEMPOTENT (safe to process the same message twice).
      // Common pattern: store processed offset/messageId in DB to deduplicate.
      await handleEvent(event, taskId, payload);

      // Offset is committed automatically after this function resolves
    },
  });
}

async function handleEvent(event: string, taskId: number, _payload: unknown) {
  switch (event) {
    case "created": console.log(`[Worker] Task ${taskId} created — send welcome email`); break;
    case "updated": console.log(`[Worker] Task ${taskId} updated — invalidate cache`);   break;
    case "deleted": console.log(`[Worker] Task ${taskId} deleted — clean up storage`);   break;
    default:        console.warn(`[Worker] Unknown event: ${event}`);
  }
}

export async function stopConsumer(): Promise<void> {
  await consumer?.disconnect();
}

// ─── INTERVIEW: What problem does Kafka solve? ───────────────────────────────
//
// REST call:     synchronous, tight coupling, caller waits for response
// Simple queue:  decouples producer/consumer but typically no replay, no fan-out
// Kafka:         durable log — messages are RETAINED (default 7 days)
//                → multiple consumer groups can independently read the same topic
//                → replay from any offset (re-process events after a bug fix)
//                → horizontal scale by adding partitions + consumers
//
// Example: "task-events" topic consumed by:
//   Group 1: email-service (sends notifications)
//   Group 2: analytics-service (updates dashboards)
//   Group 3: search-indexer (keeps Elasticsearch in sync)
//   All three read independently — no coordination needed.

