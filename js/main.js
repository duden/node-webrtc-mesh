'use strict';

/*
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
*/

var localStream; //Local Stream which get shared with the Room
var pc = []; // Array of PeerConnections
var remoteStream = []; //Array of Remote Streams to play
var turnReady; //If Turn Server is available
var numberClientsRoom = 0;
var socket = io.connect();
var peerIds = []; //IDs for Messaging
var remoteVideo = []; //Array of Video Elements for Remote Stream
var room = ''; //Room the Socket Connects to




var isChrome = true;


// TURN and STUN Server Config
//*TODO make TURN Server request only
var pcConfig = {
	'iceServers': [
	{'urls': 'stun:stun.l.google.com:19302'},
	{'urls': 'stun:87.106.1.148'}
  ]
};

// Set up !audio and video regardless of what devices are present.
var sdpConstraints = {
  offerToReceiveVideo: true
};

//Contraints for Local Video/Screen Request
var constraints = {
  video: true,
  audio: true,
  width: 1920,
  height: 1080,
 frameRate: { min: 30 } 
};

//Get Buttons from DOM
var enterButton = document.querySelector('#enterButton');
var startButton = document.querySelector('#startButton');

//get Paragraphs from DOM
var roomPara= document.querySelector('#roomPara');
var clientPara = document.querySelector('#clientsPara');

//get Local Video Element from DOM
var localVideo = document.querySelector('#localVideo');
//Get Remote Video Element Array from DOM
for(let i = 0;i<4;i++){
  remoteVideo[i] = document.querySelector('#remoteVideo'+i);
}

//Add eventListener to Buttons
enterButton.addEventListener("click", enterRoom);
startButton.addEventListener("click", getDevice);


//Search if PeerID is known
function peerIdIndex(id){
  for(let [index,val] of peerIds.entries()){
    if(val === id){
      return index;
    }
  }
  console.log(id+" id Missing")
  return -1;
}

//Update the Client Paragraph to show the number of connected Clients
function updateClientsPara(number){
  clientPara.innerHTML= 'With '+number+' Friends';
}

//Debug Function
function test(){
  sendMessage("bye");
}

//Get Room from User and Attempt to enter or create it.
function enterRoom(){
	room = prompt('Enter room name:');
	if (room !== '' && room !== null) {
		socket.emit('create or join', room);
		console.log('Attempted to create or  join room', room);
		enterButton.disabled = true;
	}
	roomPara.innerHTML = "You are in Room: "+ room;
}

// On Succesfull room Creation
socket.on('created', function(room) {
  console.log('Created room ' + room);
  numberClientsRoom = 0;
});

// On unsuccesfull room enter
socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
  alert('The Room: '+ room+' is allready full');
  enterButton.disabled = false;
});

// On Successfull join of another Client
socket.on('join', function (data){
  console.log('Another peer made a request to join room ' + data.room);
  //Push his ID into PeerIds
  peerIds.push(data.clientId);
  //Increment number of Clients
  numberClientsRoom++;
  // Update the shown number of Clients
  updateClientsPara(numberClientsRoom);
  // try to send Client a peerconnection offer
  maybeStartTo(data.clientId);
});

// On Succesfull enter of the Room 
socket.on('joined', function(data) {
  console.log('joined: ' + data.room);
  //Update Clients in Room
  numberClientsRoom = data.numClients;
  updateClientsPara(numberClientsRoom);
  //Wait to get Peer offers
});

//On other Client leaving the Room
socket.on('leaved',function(clientId){

  console.log("client "+clientId+" leaved")
    //Call Hangup Handler for ClientID  
    handleRemoteHangup(clientId);
    //Rmove Client ID from Known PeerID Array
    peerIds.forEach(function(element, i) {
      if(element == clientId){
        peerIds.splice(i,1);
      }
    });
    //Update number of Clients
    numberClientsRoom--;
    updateClientsPara(numberClientsRoom);
});
//Logging Function
socket.on('log', function(array) {
  console.log.apply(console, array);
});

//Send Message to Entire Room
function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

//Send Message to Specific Client via Client(Socket) ID
function sendMessageTo(message, to){
  console.log('Client sending message: '+ message + " to :"+ to)

  socket.emit('messageTo',{
    'message': message,
    'to': to
  });
}

// Legacy Code
//*TODO Remove or rewrite
socket.on('message', function(message) {
  console.log('Client received message:', message);
});

//Recieved Personal Message From Client ID
socket.on('messageFrom', function(data){
  //Check if ID is Known
  let isKnown = peerIdIndex(data.from);
  //If Message Type contains SDP offer
  if(data.message.type === 'offer'){
    //And Peer is Known
    if(isKnown >= 0){
      //Initialize PeerConnection for this Client
      maybeStartFrom(data.from);
      //Set RTCSessionDescription
      pc[isKnown].setRemoteDescription(new RTCSessionDescription(data.message));
      //Create and Send Answer
      doAnswer(data.form);
    } else{ //If Unkown
      //Add Peer to Known Peers and safe his ID
      peerIds.push(data.from);
      //Initialize PeerConnection
      maybeStartFrom(data.from);
      //Set RTCSessionDescription
      pc[peerIdIndex(data.from)].setRemoteDescription(new RTCSessionDescription(data.message));
      //Create and Send Answer
      doAnswer(data.from);
    } //If Message Type contains a SDP Answer 
  } else if(data.message.type === 'answer'){
    //Set RTCSessionDescription for this PeerConnection
    pc[peerIdIndex(data.from)].setRemoteDescription(new RTCSessionDescription(data.message));
    //If Message Type Contains ICE Candidates
  } else if(data.message.type === 'candidate'){
    //Create RTCIceCandidate from Data
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: data.message.label,
      candidate: data.message.candidate
    });
    //Add ICE Candidate to PeerConnection
    pc[isKnown].addIceCandidate(candidate);

    //If Client is leaving handle hangup, shouldnt be Called on a per Client base
  } else if(data.message === 'bye'){
    handleRemoteHangup(data.from);
  }
});




//*TODO is Legacy Client
function start(){
	maybeStart();
}

//Get Screen from Browser
async function getDevice(){

  let videoElem;
  var displayMediaOptions = {
    video: {
      cursor: "always"
    },
    audio: false
  };
  
    try {
      videoElem = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
      gotStream(videoElem);
      startButton.disabled = true;
		  enterButton.disabled = false;
    } catch(err) {
      console.error("Error: " + err);
    }

  
}

//gets Stream from local Browser and sets local Video/Stream
function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
}

//Starts Connection to a Client ID 
function maybeStartTo(id){
  //Creats Peer Connection for Client ID
  createPeerConnection(id);
  //adds local Stream to peerConncetion
  pc[peerIdIndex(id)].addStream(localStream);
  //Call the given ID
  doCall(id);
}
//Starts Connection to recieve Call from ID
function maybeStartFrom(id){
  //Creates Peer Connection for Client ID
  createPeerConnection(id);
  //adds local Stream to PeerConnection
  pc[peerIdIndex(id)].addStream(localStream);
}

//Sends Message to all Clients to Close Connections
window.onbeforeunload = function() {
  sendMessage('bye');
};

//Create Peer Connection for given ID
function createPeerConnection(id) {
  try {
    let peerIndex = peerIdIndex(id);
    pc[peerIndex] = new RTCPeerConnection(pcConfig);
    pc[peerIndex].onicecandidate = function(e){handleIceCandidate(e,id)};
    pc[peerIndex].onaddstream = function(e){handleRemoteStreamAdded(e,id)};
    pc[peerIndex].onremovestream = handleRemoteStreamRemoved;
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

//Sends Ice Candidates to Peer
function handleIceCandidate(event,id) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessageTo({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    },id);
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

//Calls given ID
function doCall(id) {
  pc[peerIdIndex(id)].createOffer(function(offer){
    setLocalAndSendMessage(offer,id)},function(offer){ handleCreateOfferError(offer)});
}

//Answers Call from ID
function doAnswer(id) {
  pc[peerIdIndex(id)].createAnswer().then( answer =>{
    setLocalAndSendMessage(answer,id);
    onCreateSessionDescriptionError(answer);
  });
}


function setLocalAndSendMessage(sessionDescription,id) {
  pc[peerIdIndex(id)].setLocalDescription(sessionDescription);
  sendMessageTo(sessionDescription,id);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

//Request Turn Server if no Turn Server is given
//*TODO Rework this
function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one 
        pcConfig.iceServers.push({
         // 'urls': 'turn:' + 'webrtc' + '@' + '.com',
          //'credential': ''
        });
        turnReady = true;

  }
}

function handleRemoteStreamAdded(event,id) {
  console.log('Remote stream added.');
  remoteStream[peerIdIndex(id)] = event.stream;
  remoteVideo[peerIdIndex(id)].srcObject = remoteStream[peerIdIndex(id)];
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}


function handleRemoteHangup(id) {
  console.log('Session terminated.');
  stop(id);
}

function stop(id) {
  pc[peerIdIndex(id)].close();
  pc[peerIdIndex(id)] = null;
}
