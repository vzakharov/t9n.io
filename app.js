console.log(process.version)

var restify = require('restify');
var builder = require('botbuilder');
var axios = require('axios');
var botbuilder_azure = require("botbuilder-azure");
var FormData = require('form-data');
var https = require('https');

const Credentials = require('./credentials.json')

const googlKey = Credentials.googl

var Paymentwall = require('paymentwall');
Paymentwall.Configure(
  Paymentwall.Base.API_GOODS,
  Credentials.paymentwall.username,
  Credentials.paymentwall.password
);

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);
var inMemoryStorage = new builder.MemoryBotStorage();

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


// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, [
    function (session) {
        session.beginDialog('start')
    }
]).set('storage', inMemoryStorage);

var Alan = require('alanbot')('./t9nio.json', bot)

bot.dialog('start', [
    function (session) {
        let alan = new Alan(session)
        session.beginDialog("alan.step")
    },
    function (session, results) {
        console.log(results);
        doc = results.response[0];
        session.send("Your file named **" + doc.name + "** is well received!")        
        builder.Prompts.choice(session, 
            "What language do you want to translate it to?",
            Object.assign(LANG_CODES, FROM_ENG_MORE_OPTIONS),
            {listStyle: 3});                
    },
    function (session, results){
        console.log(results);
        var targetLang = LANG_CODES[results.response.entity];
        session.send(results.response.entity+", great! Let me do some math...");
        var project = project_template;
        project.name = doc.name;
        project.targetLanguages = [targetLang];
        project.documentProperties.targetLanguages = [targetLang];
        
        console.log(project);
        
        connector.getAccessToken(function(err, token) {
            axios({
              method: 'get',
              url: doc.contentUrl,
              responseType: 'stream',
              headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/octet-stream'
            }}).then(function(response) {
                var form = new FormData();

                form.append('project', JSON.stringify(project), { contentType: 'application/json' });
                form.append('file', response.data, {
                    filename: doc.name,
                    contentType: 'application/octet-stream'
                    });
                    
                return axios.post('https://smartcat.ai/api/integration/v1/project/create', form, {
            		headers: form.getHeaders(),
            		auth: {
            			username: API_USERNAME,
            			password: API_PASSWORD               
            		}
            	});
            }).catch(function (response){
            }).then(function (response) {
                session.doc = response.data.documents[0];

                countStats(session).then(function (response) {
                    console.log(session.totalStats);
                    session.totalStats = response.data.statistics[0];
                    session.wordCount = session.totalStats.words;
                    session.price = Math.round(session.wordCount * PRICE_PER_WORD, 0);
                    
                    session.send("Okay, the price to translate this is $" + session.price + ".")
                    session.send("If you’re okay with it, here’s the link to pay:")
                    var widget = new Paymentwall.Widget(
                      'test_user',                                // id of the end-user who's making the payment
                      'pw_1',                                       // widget code, e.g. pw; can be picked in the Widgets section of your merchant account 
                      [                                           // product details for Flexible Widget Call. 
                                                                  // Leave empty if product selection happens on Paymentwall's side
                        new Paymentwall.Product(
                          't9nio_test',                           // id of the product in your system  
                          session.price,                                   // price
                          'USD',                                  // currency code
                          `${session.doc.name} — translation via t9n.io chatbot`
                        )
                      ], {evaluation: 1}
                    );
                    var url = widget.getHtmlCode().match(/src="(.*?)"/)[1];
                    googl({url: url, key: googlKey}).then(sUrl => {
                        session.send(sUrl);
                    })
                });

            }).catch(function (response){
                /*console.log("=======Start of response 2=======")
                console.log(response)
                console.log("=======End of response 2=======")*/
            })
        });
    }
])

bot.dialog('getDoc', [
    function (session) {
        if (session.message.attachments.length > 0) {
            session.endDialogWithResult({response: session.message.attachments});
            return
        }        
        builder.Prompts.attachment(session, "Upload a doc in this chat, and I’ll get it translated by real hummins. Humans.");               
    },
    function (session, results) {
        session.endDialogWithResult(results);               
    }
])

function countStats(session) {
    console.log("counting...")
    return timeout(3000).then(()=>{    
        return axios.get('https://smartcat.ai/api/integration/v1/document/statistics', {
            params: {
                documentID: session.doc.id
            },
            auth: {
            	username: API_USERNAME,
            	password: API_PASSWORD               
            }
        })}).then(function(response){        
            if (response.status == 200) {                
                session.userData.totalStats = response.data.statistics;
                console.log(session.userData.totalStats);
                return response;            
            } else {
                return countStats(session);                        
            }       
        })
}


/*bot.dialog('enterToken', [
    function (session) {
        builder.Prompts.text(session, "Enter your API token (username:password)");
    },
    function (session, results) {
        session.userData.token = results.response.split(':');
        // console.log(session.userData.token[0]);
        // console.log(session.userData.token[1]);
        return axios.get('https://smartcat.ai/api/integration/v1/project/list', {
                auth: {
                    username: session.userData.token[0],
                    password: session.userData.token[1]               
                }
            }).then(function (response) {                
                session.userData.projects = response.data.reverse();
                session.beginDialog('chooseProject');
            });
    }
]);

bot.dialog('chooseProject', [
    function (session) {
        projectHash = session.userData.projects.reduce(function(map, obj) {
            map[obj.name] = {id: obj.id};
            return map;
        }, {});
        console.log(projectHash);
        // session.send(projectNames.join());
        builder.Prompts.choice(session, 
            "Choose project", 
            projectHash, 
            {listStyle: 3}); 
    }]);*/
