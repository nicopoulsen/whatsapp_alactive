const { Graph } = require("@langchain/langgraph");
const { profileContextNode } = require("./nodes/profileContextNode");
const { searchAndFilterNode } = require("./nodes/searchAndFilterNode");
const { generalQANode } = require("./nodes/generalQANode");

async function runGraphFlow(senderNumber, userMessage) {
  console.log("🚀 Running LangGraph Flow for:", senderNumber);

  const graph = new Graph();

  // Add nodes
  graph.addNode("profileContext", profileContextNode);
  graph.addNode("searchAndFilter", searchAndFilterNode);
  graph.addNode("generalQA", generalQANode);

  // Set start node (Users entering search mode first)
  graph.setStart("profileContext");

  // Define edges (progression of conversation)
  graph.addEdge("profileContext", "searchAndFilter"); // Move from profile setup to search/filter
  graph.addEdge("searchAndFilter", "generalQA"); // Handle fallback to Q&A if needed
  graph.addEdge("generalQA", "searchAndFilter"); // Loop back to search for ongoing interactions

  const executor = graph.compile();

  // Execute the graph based on user input
  const response = await executor.run({ senderNumber, userMessage });

  return response;
}

module.exports = { runGraphFlow };
