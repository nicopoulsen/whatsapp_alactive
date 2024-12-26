const { initChatModel } = require("langchain/chat_models/universal");
require("dotenv").config();

async function testLangChain() {
    try {
        console.log("API Key:", process.env.OPENAI_API_KEY);

        console.log("Testing LangChain ChatOpenAI integration...");

        const chat = await initChatModel("gpt-3.5-turbo", { 
            modelProvider: "openai",
            openAIApiKey: process.env.OPENAI_API_KEY,
            temperature: 0.7,
        });

        const response = await chat.invoke([{ role: "user", content: "tell me the top 3 highest scoring player in the UCL champions league" }]);

        console.log("LangChain Test Successful! Response:");
        console.log(response);
    } catch (error) {
        console.error("Error during LangChain test:", error.message);
        console.error(error.stack);
    }
}

testLangChain();
