// server.js

// modules =================================================
var express           = require('express');
var app               = express();
var server            = require('http').Server(app);
var bodyParser        = require('body-parser');
var methodOverride    = require('method-override');
var io                = require('socket.io')(server);
var session           = require('express-session');
var CASAuthentication = require('cas-authentication');
var mongoose          = require('mongoose');
var config            = require('./config.js');
var cms               = require('cms-api')(config.cms_api_token);

// configuration ===========================================

//cms
cms.getRCS('villat2').then(function (response) {
    console.log(response);
});

//connect to mongodb
mongoose.connect('mongodb://localhost/elex');
var Schema = mongoose.Schema, ObjectId = Schema.ObjectId;
// mongodb schemas
var user = new mongoose.Schema({
  name : String,
  ID   : ObjectId
});
var vote = new mongoose.Schema({
  result      : String,
  meeting     : Number,
  user        : Number,
  name        : String,
  Description : String,
  ID          : ObjectId
});
var meeting = new mongoose.Schema({
  name  : String,
  date  : Date,
  pin   : Number,
  group : Number,
  ID    : ObjectId
});
var group = new mongoose.Schema({
  name    : String,
  desc    : String,
  admin   : String,
  allowed : Array,
  ID      : ObjectId
});
var users    = mongoose.model('user', user);
var votes    = mongoose.model('vote', vote);
var meetings = mongoose.model('meetings', meeting);
var groups   = mongoose.model('group', group);

//establish new session
app.use( session({
    secret            : 'super secret key',
    resave            : false,
    saveUninitialized : true
}));

var cas = new CASAuthentication({
    cas_url      : 'https://cas-auth.rpi.edu/cas',
    service_url  : 'http://localhost:3000/auth?'/*,
    cas_dev_mode : true,
    cas_dev_user : 'etzinj'*/
});

io.on('connection', function (socket) {
    //console.log(socket.request.client);
    // socket.emit('socket_req', socket.request.client);
    socket.on('my other event', function (data) {
        console.log(data.session[cas.session_name]);
    });

    //if user creates a group, add to the database
    socket.on('new group', function( info ){
        var g = groups({
            name : info.name,
            desc : info.desc
        });
        g.save(function (err, saved) {
            if (err) {
                return console.log('error saving to db');
            }else{
                console.log(info.desc);
            }
        })
    });
	
	//if user creates a meeting, add to the database
    socket.on('new meeting', function( info ){
        var m = meetings({
            name : info.name,
            pin : info.pin
        });
        m.save(function (err, saved) {
            if (err) {
                return console.log('error saving to db');
            }else{
                console.log(info.name);
            }
        })
    });
});

// config files
var db = require('./config/db');

// set our port
var port = process.env.PORT || 3000;

// connect to our mongoDB database
// (uncomment after you enter in your own credentials in config/db.js)
// mongoose.connect(db.url);

// get all data/stuff of the body (POST) parameters
// parse application/json
app.use(bodyParser.json());

// parse application/vnd.api+json as json
app.use(bodyParser.json({ type: 'application/vnd.api+json' }));

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: true }));

// override with the X-HTTP-Method-Override header in the request. simulate DELETE/PUT
app.use(methodOverride('X-HTTP-Method-Override'));

// set the static files location (ex. /public/img will be /img for users)
app.use(express.static('public'));

app.get('/auth', cas.bounce, function ( req, res ) {

    //gets your rcsid from cas
    var rcsID = req.session.cas_user;

    //searches to see if rcsID is already in db
    users.findOne({'name' : rcsID}, function(err, user){
        if(err){ console.log(err); }
        else if(!user){
            var u = new users({
                name : rcsID
            });
            u.save(function (err, saved) {
                if (err) {
                    return console.log('error saving to db');
                }else{
                    console.log("please?");
                }
            })
        }

        res.sendFile(__dirname + '/views/main_menu.html');
    });
});

app.get('/api/groups', function (req, res) {
    groups.find({}, function(err, docs){
        res.json(docs);
    });
});

app.get('/api/newGroups', function (req, res) {
    cms.getRCS("etzinj").then(function (response) {
        cms.getOrgs(JSON.parse(response)["student_id"]).then(function (docs){
            res.json(JSON.parse(docs));
        });
    });
});

app.get('/api/meetings', function (req, res) {
    meetings.find({}, function(err, docs){
        res.json(docs);
    });
});

app.get('/', function (req, res) {
    if (!req.session[cas.session_name]) {
        res.sendFile(__dirname + '/views/index.html');
    } else {
        res.redirect('/auth');
    }
})

app.get('/logout', cas.logout);

app.get('/creategroup', cas.block, function (req, res) {
    res.sendFile(__dirname + '/views/createGroup.html')
});

app.get('/createMeeting', cas.block, function (req, res) {
    res.sendFile(__dirname + '/views/createMeeting.html')
});

app.get('/createPoll', cas.block, function (req, res) {
    res.sendFile(__dirname + '/views/createPoll.html')
});

app.get('/executeCreation/:key', cas.block, function (req, res) {
    //change "etzinj" to "req.session.cas_user"
    //gets user's rin
    cms.getRCS("etzinj").then(function (response) {
        //gets user's clubs
        cms.getOrgs(JSON.parse(response)["student_id"]).then(function (docs){
            //parses response from string to json
            var resp = JSON.parse(docs);
            resp.forEach(function(arr){
                if(arr.entity_id == req.params.key){
                    var g = groups({
                        name  : arr.name,
                        desc  : arr.description,
                        admin : req.session.cas_user
                    });
                    g.save(function (err, saved) {
                        if (err) {
                            return console.log('error saving to db');
                        }else{
                            console.log(arr.name);
                        }
                    })
                    res.redirect('/auth');
                    return;
                }
            });
            res.redirect('/createGroup');
        });
    });
});

app.get('/joinvote/:key', cas.bounce, function (req, res) {
    var rcsID = req.session.cas_user;
    groups.findOne({'ID' : req.param.key}, function(err, group){
        users.findOne({'name' : rcsID}, function(err, user){
            /*
			if(group["admin"] == user["ID"]){
                res.sendFile(__dirname + '/views/createPoll.html');
            }else{
                res.sendFile(__dirname + '/views/pin.html');
            }
			*/
			res.sendFile(__dirname + '/views/meetings.html');
        });
    });
});

app.get('/polls/:key', cas.bounce, function (req, res) {
    var rcsID = req.session.cas_user;
    groups.findOne({'ID' : req.param.key}, function(err, group){
        users.findOne({'name' : rcsID}, function(err, user){
            /*
			if(group["admin"] == user["ID"]){
                res.sendFile(__dirname + '/views/createPoll.html');
            }else{
                res.sendFile(__dirname + '/views/pin.html');
            }
			*/
			res.sendFile(__dirname + '/views/polls.html');
        });
    });
});

app.post('/vote', cas.block, function ( req, res ) {
    if (!req.body.pin) {
        res.redirect('/joinvote')
        return;
    }

    res.sendFile(__dirname + '/views/vote.html');
});

// routes ==================================================
require('./app/routes')(app); // configure our routes

// start app ===============================================
server.listen(port, function(){
  console.log("Application currently listening on port " + port);
});

console.log(" ______ _      ________   __\n|  ____| |    |  ____\\ \\ \/ \/\n| |__  | |    | |__   \\ V \/ \n|  __| | |    |  __|   > <  \n| |____| |____| |____ \/ . \\ \n|______|______|______\/_\/ \\_\\\n");

console.log("Elex Voting System v1.0");

// expose app
exports = module.exports = app;
