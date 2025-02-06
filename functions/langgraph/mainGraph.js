const { Graph } = require("@langchain/langgraph");
const { profileContextNode } = require("./nodes/profileContextNode");

async function runGraphFlow(senderNumber, userMessage) {

  // create graph
  const graph = new Graph();

  // Add the profile context node
  graph.addNode("profileContext", profileContextNode, {
    ends: ["profileContext"], // Keeps looping for now as we have one testing node atm
  });
// tried using __start__ aswell for entry but got the same issue
  graph.setEntryPoint("profileContext");

  const executor = graph.compile();

  // starting from `profileContext`
  const response = await executor.invoke({
    senderNumber,
    userMessage,
  });

  return response;
}

module.exports = { runGraphFlow };
