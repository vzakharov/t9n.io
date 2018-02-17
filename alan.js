    // GIT Test 2
    var labels = {}
    var code = []
    var bot
    var builder = require('botbuilder')
    var axios = require('axios')

    const variableNamePattern = "[a-z_][a-zA-Z0-9_.]*[a-zA-Z0-9_]" // RegExp pattern to be used for identifying variable names
    const fullVariableRegExp = new RegExp("^" + variableNamePattern + "$", 'g')
    const inlineVariableRegExp = new RegExp("@" + variableNamePattern, 'g')
    
    const choiceOperators = ['among', 'need']

    const rx = {
    setToWhat: /^(to|=)$/,
    number: /^[0-9.]+$/
    }

    function getAlan(session) {
        return new Alan(session)
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

    function init(filename, initBot) {
        bot = initBot
        code = require(filename)
        prepare(code)

        bot.dialog('alan.check', [
            (session) => {
                let alan = getAlan(session)
                let name = alan.command.argument
                let value = alan.vars[name]
                let branch = alan.branches[0]
                let fork = branch.shift()
                let options = {}
                for (let i = 0; i < fork.length; i += 2) {
                    if (fork[i] == value || fork[i] == 'else') {
                        alan.branches.unshift(fork[i + 1])
                        session.beginDialog('alan.step')                    
                    }
                }
            },
            (session) => {
                alan.branches.shift()
                session.endDialog() 
            }
        ])

        bot.dialog('alan.choose.among', [
            
        ])

        bot.dialog('alan.choose.need', [
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                let variable = alan.getVar(choice.operator.argument)
                if (!variable) {
                    choice.options.shift()
                    choice.feed.shift()
                    choice.expectsCode = false
                }
                session.endDialog()
            }
        ])

        bot.dialog('alan.choose.step', [
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                choice.item = choice.feed.shift()
                let item = choice.item
                if (Array.isArray(item)) {
                    choice.expectsCode = true
                    skip(session)
                } else {                
                    let choiceOperatorsRx = new RegExp(`^(${choiceOperators.join('|')}) (${variableNamePattern})$`)
                    let match = item.match(choiceOperatorsRx)
                    if (match) {
                        choice.operator = {name:match[1], argument:match[2]}
                        session.beginDialog("alan.choose." + choice.operator.name)                
                    } else {
                        if (choice.expectsCode) {                     
                            skip(session)
                        } else {
                            choice.options.unshift(item)
                            choice.expectsCode = true
                            session.beginDialog('alan.choose.step')
                        }
                    }
                }
            },
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                if (choice.expectsCode) {
                    choice.branches[choice.options[0]] = choice.item
                    choice.expectsCode = false
                }
                if (choice.feed.length > 0) {
                    session.beginDialog('alan.choose.step')
                } else {
                    session.endDialog()
                }            
            }
        ])

        bot.dialog('alan.choose', [
            (session) => {
                let alan = getAlan(session)
                alan.choice.var = alan.getVar(alan.command.argument)
                session.endDialog()
            }
        ])

        bot.dialog('alan.choose.start', [
            (session) => {
                let alan = getAlan(session)
                alan.choice.feed = alan.item
                session.beginDialog('alan.choose.step')
            },
            (session) => {
                let alan = getAlan(session)
                builder.Prompts.choice(session, alan.messages.pop(), alan.choice.branches, { listStyle: 3 })
            }, 
            (session, results) => {
                let alan = getAlan(session)
                let result = results.response.entity
                alan.command.result = result
                alan.setVar(alan.command.argument, result)
                alan.branches.unshift(alan.choice.branches[result])
                alan.choice = Alan.default.choice
                session.endDialog() 
            }
        ])

        bot.dialog('alan.goto', [
            (session) => {
                let alan = getAlan(session)
                let where = alan.command.argument.slice()
                if (typeof where == 'string') {
                    where = labels[where].slice()
                }
                let labelName = alan.command.argument
                
                alan.branches = []
                let branchToAdd = [code]
                while (where.length > 0) {
                    alan.branches.unshift(branchToAdd[0].slice(where.shift()))
                    branchToAdd = alan.branches[0]
                }
                session.endDialog()            
            }
        ])

        bot.dialog('alan.load', [
            (session) => {
                let alan = getAlan(session)
                builder.Prompts.attachment(session, alan.messages.pop())
            },
            (session, results) => {
                bot.connector('*').getAccessToken(
                    (err, token) => {
                        let alan = getAlan(session)
                        let file = results.response[0]
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
                                alan.vars[alan.command.argument] = file
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
                    session.send(alan.messages.pop())
                }
                session.sendTyping()
                let str = alan.formatString(alan.command.argument)
                alan.messages.push(str)
                session.endDialog()            
            }        
        ])

        bot.dialog('alan.set', [
            (session) => {
                let alan = getAlan(session)
                let argument = alan.command.argument
                let what = argument.match(fullVariableRegExp)[0] 
                let toWhat
                if (argument.length == 1) {
                    // Todo: set as a boolean
                } else {
                    toWhat = argument.slice(1).join(" ")
                    if (toWhat.match(rx.setToWhat)) {
                        // Todo: set to the next item in the code
                    } else { // Set to the second argument, can be with an inline variable
                        toWhat = alan.formatString(toWhat)
                        if (toWhat.match(rx.number)){
                            toWhat = Number(toWhat)
                        }
                    }
                }
                alan.setVar(what, toWhat)
                session.endDialog()
            }
        ])

        bot.dialog('alan.skip', [
            (session) => {
                session.endDialog()
            }
        ])
            
        bot.dialog('alan.read', [
            (session) => {
                let alan = getAlan(session)
                builder.Prompts.text(session, alan.messages.pop())
            },
            (session, results) => {
                alan = getAlan(session)
                alan.command.result = results.response
                alan.vars[alan.command.argument] = alan.command.result;
                session.endDialog()
            }
        ])

        bot.dialog('alan.step', [
            (session) => {
                let alan = getAlan(session)
                let branch = alan.branches[0]
                alan.item = branch.shift()
                let item = alan.item
                alan.parseCommand()
                session.beginDialog('alan.' + alan.command.name)
            },
            (session) => {
                let alan = getAlan(session)
                let branch = alan.branches[0]
                if (branch.length == 0) {
                    alan.branches.shift()
                    if (alan.branches.length == 0) {
                        alan.branches = [code.slice()]
                    }
                }
                session.beginDialog('alan.step')
            }
        ])        

        return Alan
    }


    class Alan {      

        constructor(session) {

            let protoAlan

            if ('alan'in session.userData) {
                protoAlan = session.userData.alan
            } else {
                protoAlan = Alan.default
            }

            for (var key in protoAlan) {
                this[key] = protoAlan[key]
            }

            session.userData.alan = this
        }    

        // "Unfolds" a string including inline variables, etc.
        formatString(str) {
            let alan = this

            let variables = str.match(inlineVariableRegExp)
            if (variables) {
                variables.forEach((inlineVarName) => {
                    let varValue = alan.getVar(inlineVarName.slice(1))
                    str = str.replace(new RegExp(inlineVarName, 'g'), varValue)
                })                
            }
            return str
        }

        parseCommand() {
            let item = this.item
            if (Array.isArray(item)) {
                this.command = {name: "choose.start", argument: Alan.default.choice.var}
            } else if (typeof item == "number") {
                this.command = {name: "goto", argument: item.toString()}
            } else if (item[0] == "#") {
                this.command = {name: "skip", argument: null}
            } else if (item.substring(0,2) == ">>") {
                this.command = {name: "goto", argument: item.substring(2)}
            } else if (/^[a-z]/.test(item)) {
                let array = item.split(" ")
                let name = array[0]
                let argument = array.slice(1)
                this.command = {name: name, argument: argument}
            } else {
                this.command = {name: "print", argument: item}
            }
        }

        getVar(varName) {
            let alan = this
            let location = alan.getVarLocation(varName)
            return location.branch[location.leaf]
        }

        setVar(varName, varValue) {
            let alan = this
            let location = alan.getVarLocation(varName)
            location.branch[location.leaf] = varValue
        }

        getVarLocation(varName) {
            let alan = this
            let children = varName.split('.')
            let varBranch = alan.vars
            while (children.length > 1) {
                varBranch = varBranch[children.shift()]
            }
            return {branch:varBranch, leaf:children}
        }

        static get default() {
            return {
                vars: {},
                choice: {},
                branches: [code.slice()],
                command: {name: "", argument: null, results: null},
                item: "",
                messages: [],
                context: "",
                choice: {
                    branches: {},
                    options: [],
                    var: '_choice',
                    operator: {},
                    expectsCode: false,
                    item: "",
                    feed: []
                }      
            }
        }
    }


    module.exports = init