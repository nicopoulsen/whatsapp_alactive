import { Graph } from "@langchain/langgraph";
import { nightclubNode } from "./nodes/nightclubNode.js";
import { barNode } from "./nodes/barNode.js";
import { fallbackNode } from "./nodes/fallbackNode.js";

const graph = new Graph();

graph.addNode("nightclub", nightclubNode);
graph.addNode("bar", barNode);
graph.addNode("fallback", fallbackNode);

// 🔀 Defining Transitions for existing users
graph.addEdge("nightclub", "fallback", (data) => !data.choice);
graph.addEdge("bar", "fallback", (data) => !data.choice);

async function processMessageWithLangraph(senderNumber, userMessage) {
  const response = await graph.run("fallback", { senderNumber, userMessage });
  console.log("Graph Response:", response);
}

export { processMessageWithLangraph };
