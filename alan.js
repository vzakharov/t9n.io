// GIT Test
var labels = {}
var code
var bot
var builder = require('botbuilder')
var axios = require('axios')
var connector

const variableNamePattern = "[a-z_][a-zA-Z0-9_.]*[a-zA-Z0-9_]" // RegExp pattern to be used for identifying variable names
const fullVariableRegExp = new RegExp("^" + variableNamePattern + "$", 'g')
const inlineVariableRegExp = new RegExp("@" + variableNamePattern, 'g')

const defaultVarToChoose = '_choice'

const rx = {
	setToWhat: /^(to|=)$/,
	number: /^[0-9.]+$/,
    choiceOperators: new RegExp("^(among|need) (" + variableNamePattern + ")$")
}

// "Unfolds" a string including inline variables, etc.
function formatString(alan, str) {
    console.log("Source string: ", str)
	let variables = str.match(inlineVariableRegExp)
	if (variables) {
		console.log("Variables: ", variables)
		variables.forEach((inlineVarName) => {
            let varValue = getVar(alan, inlineVarName.slice(1))
			str = str.replace(new RegExp(inlineVarName, 'g'), varValue)
		})                
    }
    console.log("Formatted string: ", str)
	return str
}

function getVar(alan, varName) {
    let location = getVarLocation(alan, varName)
    return location.branch[location.leaf]
}

function setVar(alan, varName, varValue) {
    let location = getVarLocation(alan, varName)
    location.branch[location.leaf] = varValue
}

function getVarLocation(alan, varName) {
    console.log("varName: ", varName)
    let children = varName.split('.')
    console.log("Children: ", children)
    let varBranch = alan.vars
    while (children.length > 1) {
        varBranch = varBranch[children.shift()]
    }
    return {branch:varBranch, leaf:children}
}

function getAlan(session) {
    return session.userData.alan
}

function prepare(code, branch = []) {
    for (var i = 0; i < code.length; i++) {
        item = code[i]
        pos = branch.concat(i)
        if (Array.isArray(item)) {
            prepare(item, pos)
        } else if (typeof item == "string" && item[0] == "#") {
            labels[item.substring(1)] = pos
        }
    }
}

function skip(session) {
    session.beginDialog('alan.skip')
}

function init(filename, initBot, initConnector) {
    bot = initBot
    connector = initConnector
    code = require(filename)
    console.log(code)
    console.log("Preparing...")
    prepare(code)
    console.log("Labels:")
    console.log(labels)

    bot.dialog('alan.check', [
        (session) => {
            let alan = getAlan(session)
            let name = alan.command.args[0]                
            console.log("Variable name: " + name)
            console.log(alan.vars)
            let value = alan.vars[name]
            console.log("Variable value: " + value)
            let branch = alan.branches[0]
            console.log("Branch:")
            console.log(branch)
            let fork = branch.shift()
            console.log("Fork:")
            console.log(fork)
            let options = {}
            for (let i = 0; i < fork.length; i += 2) {
                if (fork[i] == value || fork[i] == 'else') {
                    console.log("Matched fork:")
                    console.log(fork[i + 1])
                    alan.branches.unshift(fork[i + 1])
                    session.beginDialog('alan.run')                    
                }
            }
        },
        (session) => {
            alan.branches.shift()
            session.endDialog() 
        }
    ])
    
    bot.dialog('alan.choose.cycle', [
        (session) => {
            let alan = getAlan(session)
            let choice = alan.choice
            console.log("choice.branch: ", choice.branch)
            let item = choice.branch.shift()
            console.log("item: ", item)
            if (Array.isArray(item)) {
                choice.nowCode = true
                console.log('nowCode: ', choice.nowCode)
                skip(session)
            } else {
                let match = item.match(rx.choiceOperators)
                if (match) {
                    let operator = {}
                    operator.name = match[1]
                    operator.args = match[2]
                    choice.operator = operator
                    session.beginDialog("alan.choose.operator." + operator.name)                
                } else {
                    if (!choice.nowCode) {                     
                        choice.array.unshift(item)
                        choice.nowCode = true   
                        console.log("choice.array: ", choice.array)
                    }
                    skip(session)
                }                
            }
        },
        (session) => {
            let alan = getAlan(session)
            let choice = alan.choice
            console.log('>>')
            if (choice.nowCode) {
                choice.hash[choice.array[0]] = choice.branch.shift()
                choice.nowCode = false
                console.log("choice.hash: ", choice.hash)                
            }
            if (choice.branch.length > 0) {
                session.beginDialog('alan.choose.cycle')
            } else {
                session.endDialog()
            }            
        }
    ])
    
    bot.dialog('alan.choose.operator.among', [
        
    ])
    
    bot.dialog('alan.choose.operator.need', [
        (session) => {
            let alan = getAlan(session)
            let choice = alan.choice
            let variable = getVar(alan, choice.operator.args)
            if (!variable) {
                choice.array.shift()
                choice.branch.shift()
            }
            session.endDialog()
        }
    ])
    
    bot.dialog('alan.choose', [
        (session) => {
            let alan = getAlan(session)
            if (alan.choice.default) {
                alan.choice.branch = alan.item
            } else {
                alan.choice.branch = alan.branches[0].shift()
            }
            alan.choice.default = false
            alan.choice.nowCode = false
            alan.choice.array = [] 
            alan.choice.hash = {}
            session.beginDialog('alan.choose.cycle')
        },
        (session) => {
            let alan = getAlan(session)
            builder.Prompts.choice(session, alan.messages.pop(), alan.choice.hash, { listStyle: 3 })
        }, 
        (session, results) => {
            // ...
            let alan = getAlan(session)
            let result = results.response.entity
            alan.command.results = result
            alan.vars[alan.command.args[0]] = result;
            console.log(alan.vars)
            let fork = alan.item
            let i = alan.choices[result]
            console.log("Matched fork:")
            console.log(fork[i + 1])
            alan.branches.unshift(fork[i + 1])
            session.endDialog() 
        }
    ])
    
    bot.dialog('alan.goto', [
        (session) => {
            let alan = getAlan(session)
            let where = alan.command.args[0].slice()
            if (typeof where == 'string') {
                where = labels[where].slice()
            }
            let labelName = alan.command.args[0]
            
            console.log('Goto: ', where)
              
            alan.branches = []
            let branchToAdd = [code]
            while (where.length > 0) {
                alan.branches.unshift(branchToAdd[0].slice(where.shift()))
                branchToAdd = alan.branches[0]
                console.log('branchToAdd: ', branchToAdd)
                console.log('alan.branches: ', alan.branches)
                console.log('where: ', where)
            }
            session.endDialog()            
        }
    ])
    
    bot.dialog('alan.load', [
        (session) => {
            let alan = getAlan(session)
            console.log(alan.messages)
            builder.Prompts.attachment(session, alan.messages.pop())
        },
        (session, results) => {
            connector.getAccessToken(
                (err, token) => {
                    let alan = getAlan(session)
                    let file = results.response[0]
                    console.log("File: ", file)
                    console.log("Token: ", token)
                    axios({
                      method: 'get',
                      url: file.contentUrl,
                      responseType: 'stream',
                      headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/octet-stream'
                    }}).then(
                        (response) => {                            
                            file.data = response.data._readableState.buffer.head
                            console.log("File: ", file.data)
                            alan.vars[alan.command.args[0]] = file
                            session.endDialog()
                        }
                    )
                }
            )
        }
    ])
    
    bot.dialog('alan.print', [
        (session) => {
            let alan = getAlan(session)
            if (alan.messages.length > 0) {
                console.log("Messages:", alan.messages)
                session.send(alan.messages.pop())
            }
            session.sendTyping()
            console.log("Alan: ", alan)
            let str = formatString(alan, alan.command.args[0])
            console.log("String: ", str)
            alan.messages.push(str)
            session.endDialog()            
        }        
    ])

    bot.dialog('alan.set', [
        (session) => {
            let alan = getAlan(session)
			let args = alan.command.args
            console.log("Args[0]: ", args[0])
            console.log("Regex: ", fullVariableRegExp)
            let what = args[0].match(fullVariableRegExp)[0] 
            console.log("What: ", what)
            let toWhat
			if (args.length == 1) {
				// Todo: set as a boolean
			} else {
				toWhat = args.slice(1).join(" ")
				if (toWhat.match(rx.setToWhat)) {
					// Todo: set to the next item in the code
				} else { // Set to the second argument, can be with an inline variable
					toWhat = formatString(alan, toWhat)
					if (toWhat.match(rx.number)){
						toWhat = Number(toWhat)
					}
				}
			}
            console.log("toWhat: ", toWhat)
            setVar(alan, what, toWhat)
			console.log("Vars: ", alan.vars)
			session.endDialog()
        }
    ])

    bot.dialog('alan.skip', [(session) => {session.endDialog()}])
        
    bot.dialog('alan.read', [
        (session) => {
            let alan = getAlan(session)
            builder.Prompts.text(session, alan.messages.pop())
        },
        (session, results) => {
            alan = getAlan(session)
            alan.command.results = results.response
            alan.vars[alan.command.args[0]] = alan.command.results;
            console.log(alan.vars)
            session.endDialog()
        }
    ])

    bot.dialog('alan.run', [
        (session) => {
            let alan = getAlan(session)
            let branch = alan.branches[0]
            //console.log("Running branch:", branch)
            alan.item = branch.shift()
            let item = alan.item
            console.log("Item: ", item)
            console.log("alan.getCommand: ", alan.getCommand)
            alan.command = getCommand(alan)
            console.log("Command: ", alan.command)
            session.beginDialog('alan.' + alan.command.name)
        },
        (session) => {
            let alan = getAlan(session)
            console.log(alan.branches)
            let branch = alan.branches[0]
            if (branch.length == 0) {
                alan.branches.shift()
                if (alan.branches.length == 0) {
                    alan.branches = [code.slice()]
                }
            }
            session.beginDialog('alan.run')
        }
    ])        
}


function makeAlan(session) {
    session.userData.alan = {
        vars: {},
        choice: {},
        branches: [code.slice()],
        command: {name: "", args: [], results: null},
        item: "",
        messages: []
    }    
}

function getCommand(alan) {
    let item = alan.item
    if (Array.isArray(item)) {
        alan.choice.default = true
        return {name: "choose", args: [defaultVarToChoose]}
    } else if (typeof item == "number") {
        return {name: "goto", args: [item.toString()]}
    } else if (item[0] == "#") {
        return {name: "skip", args: null}
    } else if (item.substring(0,2) == ">>") {
        return {name: "goto", args: [item.substring(2)]}
    } else if (/^[a-z]/.test(item)) {
        let array = item.split(" ")
        console.log(array)
        let name = array[0]
        let args = array.slice(1)
        console.log({name: name, args: args})
        return {name: name, args: args}
    } else {
        return {name: "print", args: [item]}
    }
}

    
module.exports = {
    init,
    makeAlan
}

/*            for (let i = 0; i < fork.length; i += 2) {
                let choice = fork[i]
                console.log(choice)
                if (Array.isArray(choice)) {
                    let options = choice[0]
                    let operator
                    let argument
                    let qualifies
                    if (typeof options == 'string') {
                        options = options.slice(' ')
                        operator = options[0]
                        argument = options[1]
                    }
                    if (operator == 'need') {
                        qualifies = argument in alan.vars
                    }
                    if (!qualifies) continue
                    choice = choice[1]
                }
                choices[choice] = i
                console.log(choices)                
            }
            console.log(alan.messages)*/