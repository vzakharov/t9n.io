    // GIT Test 2
    var labels = {}
    var code = []
    var bot
    var builder = require('botbuilder')
    var axios = require('axios')
    var Rx = require ('xregexp')

    const variableNamePattern = "[a-z_][a-zA-Z0-9_.]*[a-zA-Z0-9_]" // RegExp pattern to be used for identifying variable names
    const fullVariableRegExp = new RegExp("^" + variableNamePattern + "$", 'g')
    const inlineVariableRegExp = new RegExp("@" + variableNamePattern, 'g')
    
    const choiceOperators = ['among', 'need']

    const defaultArgPattern = Rx(`(?<what>${variableNamePattern})$`)

    const rx = {
        setToWhat: /^(to|=)$/,
        number: /^[0-9.]+$/,
        command: /^([a-z][a-zA-Z.]+) (.+)$/,
        args: {
            choose: {
                among: defaultArgPattern,
                need: defaultArgPattern
            },
            set: Rx(`(?<what> ${variableNamePattern} )          # variable name
                (
                    (?<boolean> $)                          |   # no argument (set to 1/true)
                    (   [ ]
                        (?<toNextItem> (to|=|>>)$ )         |   # to the next item in the alan feed
                        (?<number> [0-9.]+$)                |   # to a number 
                        (?<var> @${variableNamePattern}$)   |   # to another variable’s value
                        (?<value> .*)                           # to anything else
                        $
                    )
                )`, 'x')
        }
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
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                let what = choice.operator.args.what
                let options = alan.getVar(what)
                choice.options.unshift(options)
                session.endDialog()
            }
        ])

        bot.dialog('alan.choose.need', [
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                let variable = alan.getVar(choice.operator.args.what)
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
                    for (operatorName in rx.args.choose) {
                        let operatorArgs = rx.args.choose[operatorName].xregexp.source
                        let regex = Rx(`^${operatorName} ${operatorArgs}`)
                        let args = Rx.exec(item, regex)
                        if (args) {
                            choice.operator = {
                                name: operatorName,
                                args: args
                            }
                            session.beginDialog('alan.choose.' + choice.operator.name)
                            return
                        }
                    }
                    if (choice.expectsCode) {                     
                        skip(session)
                    } else {
                        choice.options.unshift(item)
                        choice.expectsCode = true
                        session.beginDialog('alan.choose.step')
                    }
                }
            },
            (session) => {
                let alan = getAlan(session)
                let choice = alan.choice
                if (choice.expectsCode) {
                    let options = choice.options[0]
                    if (!Array.isArray(options)) {
                        options = [options]
                    }
                    options.forEach(option => {
                        choice.branches[option] = choice.item                        
                    });
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
                alan.choice.var = alan.command.argument
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
                let choice = alan.choice
                let result = results.response.entity
                alan.command.result = result
                alan.setVar(choice.var, result)
                alan.branches.unshift(choice.branches[result])
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
                let args = Rx.exec(alan.command.argument, rx.args['set'])
                let value
                //let args = argument.split(' ')
                if (args.boolean) {
                    value = 1
                } else if (args.number) {
                    value = Number(args.number)
                } else if (args.toNextItem) {
                    value = alan.branches[0].shift()
                } else if (args.var) {
                    value = alan.getVar(args.var)
                } else {
                    value = args.value
                }
                alan.setVar(args.what, value)
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
            } else {
                let match = item.match(rx.command)
                if (match) {
                    this.command = {name: match[1], argument: match[2]}
                } else {
                    this.command = {name: "print", argument: item}
                }    
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
                let item = children.shift()
                if (!(item in varBranch)) {
                    varBranch[item] = {}
                }
                varBranch = varBranch[item]                
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
                    operator: null,
                    expectsCode: false,
                    item: "",
                    feed: []
                }      
            }
        }
    }


    module.exports = init