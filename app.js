const Slackalog = require('./slackalog')

Slackalog.prototype.script = async function () {

    with (this) {
        say('Hey @@, how are you today?')
        let {text} = await input()
        say(`I’m ${text} too!`)            
    }

}