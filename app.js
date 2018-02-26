console.log(process.version)

var restify = require('restify');
var builder = require('botbuilder');
var axios = require('axios');
var botbuilder_azure = require("botbuilder-azure");
var FormData = require('form-data');
var https = require('https');
var Alan = require('alanbot')

const Credentials = require('./credentials.json')

const googlKey = Credentials.googl

var Paymentwall = require('paymentwall');
Paymentwall.Configure(
  Paymentwall.Base.API_GOODS,
  Credentials.paymentwall.username,
  Credentials.paymentwall.password
);

  

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

var project_template = {
    name: "test",
    description: "Test project",
    deadline: "2018-01-30T12:44:29.137Z",
    sourceLanguage: "en",
    targetLanguages: ["ru"],
    isForTesting: true,
    documentProperties: [
    {
      targetLanguages: ["ru"]
    }
    ],
    assignToVendor: false
    }

const PRICE_PER_WORD = 0.10;
const UPLOAD_A_DOC = "Translate a document"
const API_USERNAME = Credentials.smartcat.username
const API_PASSWORD = Credentials.smartcat.password
const LANG_CODES = {
    "Chinese": "zh-Hans",
    "Japanese": "ja",
    "Spanish": "es-ES",
    "German": "de",
    "French": "fr",
    "Portuguese": "pt",
    "Italian": "it",
    "Russian": "ru",
    "Korean": "ko",
    "Arabic": "ar"
//    "I need some other language": {code: "other"},
//    "I need many of them": {code: "multilang"}
}

const FROM_ENG_MORE_OPTIONS = {
    "Other/several languages": "other",
    "I want to translate TO English": "en" 
}


Alan.init(require('./t9nio.json'))