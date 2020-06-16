'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var https = require('https');
var socketIO = require('socket.io');
var tls = require('tls');
var fs = require('fs');

//SSL Certificate Load
var options = {
  key: fs.readFileSync('sec/keys/your_keys.key'),
  cert: fs.readFileSync('sec/keys/your_certificate.cer'),
  ca: fs.readFileSync('sec/keys/your_certificate_INTERMEDIATE.cer')
};

//CORS Enable
var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', 'example.com');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');

    next();
}

//Initialize Server
var fileServer = new(nodeStatic.Server)();
var app = https.createServer(options,function(req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Request-Method', '*');
	res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
	res.setHeader('Access-Control-Allow-Headers', '*');
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	if ( req.method === 'OPTIONS' ) {
		res.writeHead(200);
		res.end();
		return;
	}
  fileServer.serve(req, res);
}).listen(8080);

// Start Websocket Server
var io = socketIO.listen(app);
io.set('origins','*:*');
io.sockets.on('connection', function(socket) {

  // convenience function to log server messages on the client
  function log() {
    var array = ['Message from server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }
  // Function on dc *TODO* need overhaul
  socket.on('disconnect', function(){
    socket.broadcast.to(socket.room).emit('leaved',socket.id);
  });

  //Relay Message in Channel Function
  socket.on('message', function(message) {
    log('Client '+socket.id+'in '+socket.rooms+' said: ', message);
    //Sends Leave message to all Clients
    if(message === 'bye'){
      for(var k in socket.rooms)
      {
        if(socket.rooms.hasOwnProperty(k)){
          socket.broadcast.to(k).emit('leaved', socket.id
          );
        }
      };
    }
    // *TODO not working
    socket.broadcast.to(socket.rooms).emit('message', message);
  });
  //Relay Message to Specific Socket
  socket.on('messageTo',function(data){
    log('Client '+socket.id+' said: '+data.message+' to: '+data.to)
    io.to(data.to).emit('messageFrom',{
      'message':data.message,
      'from': socket.id
    });
  });

  //On Room Enter
  socket.on('create or join', function(room) {
    log('Received request to create or join room ' + room);

    var clientsInRoom = io.sockets.adapter.rooms[room];
    var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    log('Room ' + room + ' now has ' + numClients + ' client(s)');
    //Create Room
    if (numClients === 0) {
      socket.join(room);
      log('Client ID ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);
    //Join Room
    } else if (numClients <= 4) {
      log('Client ID ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join',{ 
      'room': room,
      'numClient': numClients,
      'clientId': socket.id
    });
      socket.join(room);
      socket.emit('joined', {'room':room, 'numClients': numClients}, socket.id);
      io.sockets.in(room).emit('ready');
    } else { // max 5 Clients per Room -> Access denied
      socket.emit('full', room);
    }
  });
  //Networking Function
  socket.on('ipaddr', function() {
    var ifaces = os.networkInterfaces();
    for (var dev in ifaces) {
      ifaces[dev].forEach(function(details) {
        if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
          socket.emit('ipaddr', details.address);
        }
      });
    }
  });

});
