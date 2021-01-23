var express = require('express');
var app = express();
var cookieParser = require('cookie-parser'); 
var serv = require('http').Server(app);

app.get('/',function(req,res) {
	res.sendFile(__dirname + '/client/index.html');
});

app.use('/client',express.static(__dirname + '/client'));

serv.listen(process.env.PORT || 2000);
console.log("Server started.");

app.use(cookieParser()); 

var io = require('socket.io')(serv, {});

var online_players = {};
var games = [];
var game_parameters = {};

var fam_friend_get_to_know_list = [];
var fam_friend_list = [];
var get_to_know_list = [];
var no_qualifiers_list = [];

var fun_facts_list = [];
var canned_answers_list = [];
var all_player_attributes = {};
var in_process_attributes = {};

function initialize_server(lines, outputIndex) {

	var output_list = [];

	output_list = lines;

	for (var i = 0; i < output_list.length; i++) {
		var lineTemp = output_list[i];
		lineTemp = lineTemp.replace('\r', '');
		output_list[i] = lineTemp
	};

	switch (outputIndex) {
		case 0:
			for (var i = 0; i < output_list.length; i++) {
				if (output_list[i].charAt(0) == "1") {
					if (output_list[i].charAt(2) == "1") {
						fam_friend_get_to_know_list.push(output_list[i].substring(4))
					}
					fam_friend_list.push(output_list[i].substring(4))

				} 

				if (output_list[i].charAt(2) == "1") {
					get_to_know_list.push(output_list[i].substring(4))
				}

				no_qualifiers_list.push(output_list[i].substring(4))
			}
			break;
		case 1:
			fun_facts_list = output_list
			break;
		case 2:
			canned_answers_list = output_list
			break;
	}

	console.log('We initialized a list!');

};

readCSV(0);
readCSV(1);
readCSV(2); 

io.sockets.on('connection', function(socket) {

	socket.emit('checkCookie')
	getRandomCannedAnswer(socket.id)

	socket.on('checkedCookie', function(data) {
		console.log(data.gamecode)
		console.log(data.username)
		console.log(socket.id)
		if (data.gamecode != "") {
			if (data.gamecode in in_process_attributes && in_process_attributes[data.gamecode][Object.keys(in_process_attributes[data.gamecode])[0]][20] == false) {
				
				var flag = false;
				var players_attributes = in_process_attributes[data.gamecode]
				for (let player in players_attributes) {
					if (players_attributes[player][0] == "the ghost of " + data.username) {
						reanimate(data.gamecode, data.username, socket.id);
						flag = true;
						break;
					}
				}

				if (!flag) {
					online_players[socket.id] = 0;
				}
				
			} else {
				online_players[socket.id] = 0;
			}
		} else {
			online_players[socket.id] = 0;
		}
	});

	socket.on('joinGame', function(data) {
		if (typeof findGame(data.gamecode) == "boolean") {
			alertUser(socket.id,'error1');
			//error1 denotes that the game doesn't exist
		} else if (data.gamecode in in_process_attributes) {
			alertUser(socket.id,'error6');
			//error6 if the game has already started
		} else {
			if (in_game(socket.id) == false) {
				if (num_players_in_game(data.gamecode) == 9) {
					alertUser(socket.id,'error4')
					//error4 denotes that the game is full
				} else {
					var shortname = data.username;
					var indexOfGame = findGame(data.gamecode);

					if (isShortNameUnique(shortname, games[indexOfGame])) {
						//games[temp].splice(1, 0, socket.id);
						add_player_to_game(indexOfGame, socket.id, shortname)
						//attribute list: short name, score, q1-q3, a1-a3, answerer, story, title, f1-f3
						//make function to do this or this section will look gross
						update_host(games[indexOfGame], data.gamecode);
						socket.emit('joinedLobby');
						//add code here to send a fun fact or something to display in place
						//of the intro paragraph
					} else {
						alertUser(socket.id,'error5');
						//error5 denotes that the shortname is already taken
					}
				}

			} else {
				alertUser(socket.id,'error2');
				//error2 denotes that the player is already in a game
			};
		};
	});

	socket.on('createLobby', function(data) {

		if (in_game(socket.id) == false) {
			//add shortname here
			var gameId = makeid(10);
			initializeGame(gameId, socket.id, data.username)
			socket.emit('showID', {gameId});
		} else {
			alertUser(socket.id,'error2');
		}

	});

	socket.on('startGame', function(data) {
		var game = (in_game(socket.id)).i
		var gameId = (games[game])[0]
		if ((games[game]).length < 5) {
			alertUser(socket.id,'error3');
			//error3 denotes that there are fewer than the minimum players in the game
		} else {
			for (var i = 1; i < games[game].length; i++) {
				var playerID = (games[game])[i];
				changeHTML(playerID);
			};

			game_parameters[gameId] = [data.familyStatus, data.getToKnowYouStatus]

			startGame(gameId, data.familyStatus, data.getToKnowYouStatus, false);
		}

	});

	socket.on('readyPlayerOne', function() {
		var gameID = online_players[socket.id]
		var players_attributes = in_process_attributes[gameID]

		for (let player in players_attributes) {
			players_attributes[player][21] = 1;
			sendQuestions(player, players_attributes);
		}
	})

	socket.on('receiveAnswers', function(data) {

		var gameID = online_players[socket.id]
		var players_attributes = in_process_attributes[gameID]

		players_attributes[socket.id][5] = data.answer1
		players_attributes[socket.id][6] = data.answer2
		players_attributes[socket.id][7] = data.answer3

		var conditions_list = [5,6,7]

		if (!isLastPlayer(players_attributes, conditions_list)) {
			updateEntireAfterRound(socket.id, gameID, conditions_list);
			addOnePlayerToWaitingScreen(socket.id, players_attributes, conditions_list)
		} else {
			delayBeforeStartRound(players_attributes, 'start_story_rd')
		}

	});

	socket.on('startStoryRound', function() {
		var gameID = online_players[socket.id]
		storyRound(gameID);
	})

	socket.on('receiveStory', function(data) {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		players_attributes[socket.id][9] = data.story
		players_attributes[socket.id][10] = data.story_title
		
		var conditions_list = [9,10]

		if (!isLastPlayer(players_attributes, conditions_list)) {
			updateEntireAfterRound(socket.id, gameID, conditions_list);
			addOnePlayerToWaitingScreen(socket.id, players_attributes, conditions_list)
		} else {
			randomizeOrder(players_attributes, 'stories', gameID)
		}

	});

	socket.on('submitQuestions', function(data) {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		players_attributes[socket.id][13] = data.question1
		players_attributes[socket.id][14] = data.question2
		players_attributes[socket.id][15] = data.question3

		var conditions_list = [13,14,15]

		if (!isLastPlayer(players_attributes, conditions_list)) {
			updateEntireAfterRound(socket.id, gameID, conditions_list);
			addOnePlayerToWaitingScreen(socket.id, players_attributes, conditions_list)
		} else {
			displayQuestions(gameID)
		}

	});

	socket.on('continueDisplayStory', function() {

		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		if (randomizeOrder(players_attributes, 'stories', gameID)) {
			votingStories(gameID)
		}

	});

	socket.on('addVotes', function(data) {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		for (let player in players_attributes) {
			if (!players_attributes[player][19]) {

				if (players_attributes[player][0] == data.place1) {
					players_attributes[player][1] += 1000
				} else if (players_attributes[player][0] == data.place2) {
					players_attributes[player][1] += 500
				} else if (players_attributes[player][0] == data.place3) {
					players_attributes[player][1] += 250
				}
			}
		}
		//update scores

		players_attributes[socket.id][12] = true;
		//the person that just submitted is done voting

		var conditions_list = [12]

		if (!isLastPlayer(players_attributes, conditions_list)) {
			updateEntireAfterRound(socket.id, gameID, conditions_list);
			addOnePlayerToWaitingScreen(socket.id, players_attributes, conditions_list)
		} else {
			showVotes(gameID, players_attributes, false)
		}

	});

	socket.on('doneWithScores', function() {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		for (let player in players_attributes) {
			io.to(player).emit('showWaitingScreen')
		};

		delayBeforeStartRound(players_attributes, 'start_making_questions')

	});

	socket.on('beginMakingQuestions', function() {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		for (let player in players_attributes) {
			players_attributes[player][21] = 8
			var answerer = players_attributes[player][8]

			ans1 = players_attributes[answerer][5]
			ans2 = players_attributes[answerer][6]
			ans3 = players_attributes[answerer][7]

			io.to(player).emit('startMakingQuestions', {ans1, ans2, ans3})
		};
	})

	socket.on('goToNextQuestion', function() {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];
		var bigDone = sendQuestionsRound(players_attributes)

		if (bigDone) {
			showVotes(gameID, players_attributes, true)
		}

	});

	socket.on('emojiButtonPress', function(data) {

		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];
		if (!players_attributes[data.spotlightPlayer][19]) {
			players_attributes[data.spotlightPlayer][1] += data.score;
		}

	});

	socket.on('gameOver', function() {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];
		var max_score = 0;
		var max_player = socket.id;

		for (let player in players_attributes) {
			var comp_score = players_attributes[player][1]
			if (comp_score > max_score) {
				max_player = player
				max_score = comp_score
			};
		};

		var winningStory = players_attributes[max_player][9]
		var winningStoryTitle = players_attributes[max_player][10]
		var winningStoryShortname = players_attributes[max_player][0]

		for (let player in players_attributes) {
			players_attributes[player][20] = true;
			io.to(player).emit('finishGame', {winningStory, winningStoryTitle, winningStoryShortname})
		};

		var host = find_host(gameID)
		io.to(host).emit('addPlayAgainButton')

	});

	socket.on('playGameAgain', function() {
		var gameID = online_players[socket.id];
		var players_attributes = in_process_attributes[gameID];

		for (let player in players_attributes) {

			if (players_attributes[player][19] || !(player in online_players)) {
				delete players_attributes[player]
			} else {
				getRandomCannedAnswer(player)
				players_attributes[player] = initialize_user_attributes(players_attributes[player][0])	
			}

		};

		if (Object.keys(players_attributes).length < 4) {
			io.to(find_host(gameID)).emit('notEnoughPlayers')
		} else {
			var familyStatus = game_parameters[gameID][0]
			var getToKnowYou = game_parameters[gameID][1]
			
			for (let player in players_attributes) {
				io.to(player).emit('restartGame')
			}

			startGame(gameID, familyStatus, getToKnowYou, true)
		}

	});

	socket.on('returnGameToLobby', function() {

		var gameID = online_players[socket.id];
		var players_attributes_old = in_process_attributes[gameID];
		var players_attributes = {};
		Object.assign(players_attributes, players_attributes_old);
		var host = find_host(gameID)
		destroy_game(gameID)

		initializeGame(gameID, host, players_attributes[host][0])
		var indexOfGame = findGame(gameID);

		shortnamesList = '';
		var front = ' '

		for (var i = 0; i < Object.keys(players_attributes).length; i++) {
			if (players_attributes[Object.keys(players_attributes)[i]][19] == false) {

				shortnamesList += front + ((players_attributes[Object.keys(players_attributes)[i]][0]))
				if (Object.keys(players_attributes)[i] == socket.id) {
					shortnamesList += ' (you)'
				}
				
				front = ', '
			}
		}
		//#TODO get string concat set up to send over shortnamesList

		for (let player in players_attributes) {
			if (player != host && !players_attributes[player][19]) {
				add_player_to_game(indexOfGame, player, players_attributes[player][0])
				io.to(player).emit('backToLobbyNewGame')
			} else if (!players_attributes[player][19]) {
				io.to(player).emit('backToLobbyNewGameHost', {shortnamesList})
			}
		}

	})

	socket.on('disconnect', function() {

		var is_game_started = 0;
		var master_indexes = in_game(socket.id);

		//if they are not in a game
		if (!master_indexes) {
			delete online_players[socket.id]
			//case where the player leaves before joining or creating any games
		} else {
			var gameID = online_players[socket.id];

			if (gameID in in_process_attributes) {
				is_game_started = 1;
				//if they are in a game and it has started

			} else {
				is_game_started = 2;
				//if they are in a game and it has not already started
			}

		}

		if (is_game_started == 1) {

			var gameID = games[master_indexes.i][0];
			var players_attributes = in_process_attributes[gameID];
			var list_of_ghosts = whoIsAGhost(players_attributes)

			if (list_of_ghosts.length == Object.keys(players_attributes).length - 1 || Object.keys(players_attributes).length == 1) {
				//covers cases where they are the last one to leave in a game that is over or not
				destroy_game(gameID);
				delete in_process_attributes[gameID];
			} else {
				//if they are not the last one in the game

				if (games[master_indexes.i][1] == socket.id) {
					//if they are the host

					newHost(games[master_indexes.i][2], gameID)
					//transfer host
				} 
				updateGhostPlayersList(players_attributes, players_attributes[socket.id][0])

				games[master_indexes.i].push(socket.id)
				games[master_indexes.i].splice(master_indexes.p, 1);
				autofillGhost(players_attributes, socket.id, gameID)

			}


			delete online_players[socket.id]

		} else if (is_game_started == 2) {

			var master_indexes = in_game(socket.id);
			var gameID = games[master_indexes.i][0]

			if (num_players_in_game(gameID) == 2) {
				destroy_game(gameID)
				//case where they created a game, no one else joined, they left before starting
			} else {

				if (games[master_indexes.i][1] == socket.id) {
					io.to(games[master_indexes.i][2]).emit('transferHost', {gameID});
					//function here that transfers host duties to another soul
					//case where they created a game, other people joined, they left before starting
				}

				games[master_indexes.i].splice(master_indexes.p, 1);
				update_host(games[master_indexes.i], gameID);
				//remove them from the game
			}	
			delete all_player_attributes[socket.id]
			delete online_players[socket.id]
		}

	});

});
//done with all socket message receiving

function reanimate(gameID, shortname, socketID) {
	online_players[socketID] = gameID;
	games[findGame(gameID)].push(socketID);

	var players_attributes = in_process_attributes[gameID];
	for (let playerID in players_attributes) {
		if (players_attributes[playerID][0] == "the ghost of " + shortname) {
			var oldSocket = playerID
			players_attributes[socketID] = players_attributes[playerID];
			delete players_attributes[playerID];
			break;
		}
	}

	for (let playerID in players_attributes) {
		if (players_attributes[playerID][8] == oldSocket) {
			players_attributes[playerID][8] = socketID
			break;
		}
	}

	var posInGame = positionInGame(players_attributes)
	players_attributes[socketID][0] = shortname;
	players_attributes[socketID][19] = false;

	unAutofillGhost(players_attributes, socketID, posInGame)
	necromancy(socketID, players_attributes, shortname)

}

function necromancy(socketID, players_attributes, shortname) {
	//adds a message to the waitingScreen div saying they will be added soon, and
	//update all player screen things and players list for the player that just joined
	var listShortnames = [];
	for (let player in players_attributes) {
		listShortnames.push(players_attributes[player][0])
		if (player != socketID) {
			io.to(player).emit('reanimateGhostPlayerForEveryone', {shortname})
		}
	}
	io.to(socketID).emit('playerWaitScreen', {listShortnames, shortname})
}

function positionInGame(players_attributes) {
	//returns what stage of the game it is in
	return players_attributes[Object.keys(players_attributes)[0]][21]
}
function unAutofillGhost(players_attributes, socketID, posInGame) {
	//appropriately adjusts players_attributes based on the position in game

	switch (posInGame) {

		case 0:
			players_attributes[socketID][5] = ''
			players_attributes[socketID][6] = ''
			players_attributes[socketID][7] = ''
		case 1:
		case 2:
			players_attributes[socketID][9] = ''
			players_attributes[socketID][10] = ''
		case 3:
			players_attributes[socketID][11] = false;
		case 4:
			players_attributes[socketID][12] = false;
		case 5:
		case 6:
		case 7:
			players_attributes[socketID][13] = ''
			players_attributes[socketID][14] = ''
			players_attributes[socketID][15] = ''
		case 8:
		case 9:
			break;
		case 10:
			io.to(socketID).emit('lastRoundWinnerStoryHide')
		default:
			break;

	}

}

function add_player_to_game(gameIndex, playerID, shortname) {
	games[gameIndex].push(playerID);
	add_player_to_player_attributes(playerID, shortname)
}

function initializeGame(gameID, playerID, shortname) {
	games.push([gameID, playerID]);
	add_player_to_player_attributes(playerID, shortname)
}

function add_player_to_player_attributes(playerID, shortname) {
	var user_attributes = initialize_user_attributes(shortname);
	all_player_attributes[playerID] = user_attributes;
}

function autofillGhost(players_attributes, playerID, gameID) {

	players_attributes[playerID][0] = "the ghost of " + players_attributes[playerID][0]
	players_attributes[playerID][11] = true
	players_attributes[playerID][12] = true
	players_attributes[playerID][19] = true;

	if (players_attributes[playerID][5] == '') {
		var listAnswers = getGhostAnswers()
		players_attributes[playerID][5] = listAnswers[0]
		players_attributes[playerID][6] = listAnswers[1]
		players_attributes[playerID][7] = listAnswers[2]
		if (addOnePlayerToWaitingScreen(playerID, players_attributes, [5,6,7])) {
			delayBeforeStartRound(players_attributes, 'start_story_rd')
			//some sort of delay here before starting, maybe an animation, some sound
		}
	}

	if (players_attributes[playerID][9] == '') {
		players_attributes[playerID][9] = 'Your friend, the ghost, wrote a ghost story. But, we think it\'s too scary for you.'
		players_attributes[playerID][10] = 'Boo!'
		if (addOnePlayerToWaitingScreen(playerID, players_attributes, [9,10])) {
			randomizeOrder(players_attributes, 'stories', gameID)
		}
	}

	if (players_attributes[playerID][13] == '') {
		players_attributes[playerID][13] = 'How do you know when a ghost is sad?'
		players_attributes[playerID][14] = 'Why do ghosts hate the rain?'
		players_attributes[playerID][15] = 'What\'s a little ghost\'s favorite game?'
		if (addOnePlayerToWaitingScreen(playerID, players_attributes, [13,14,15])) {
			displayQuestions(online_players[playerID])
		}
	}
}


function newHost(new_host, gameID) {
	var players_attributes = in_process_attributes[gameID];

	if (players_attributes[new_host][20]) {
		io.to(new_host).emit('addFinalScreenContinue')
		return;
	}
	//host left, someone needs the finish button

	var posInGame = positionInGame(players_attributes)

	if (posInGame == 4) {
		io.to(new_host).emit('addContinueButton')
	} else if (posInGame == 9) {
		io.to(new_host).emit('addContinueQuestionButton')
	}

	// var flag = false;
	// for (let player in players_attributes) {
	// 	if (players_attributes[player][9] == '' || players_attributes[player][10] == '') {
	// 		flag = true;
	// 		break;
	// 	}
	// }
	// //if the story round is not done yet

	// if (!flag) {
	// 	for (let player in players_attributes) {
	// 		if (!players_attributes[player][11]) {
	// 			flag = true;
	// 			io.to(new_host).emit('addContinueButton')
	// 			return;
	// 		}
	// 	}
	// }
	// //host left, someone needs next story button

	// flag = false;

	// for (let player in players_attributes) {
	// 	if (players_attributes[player][13] == '' || players_attributes[player][14] == '' || players_attributes[player][15] == '') {
	// 		flag = true;
	// 		return;
	// 	}
	// }

	// if (!flag) {
	// 	for (let player in players_attributes) {
	// 		if (!players_attributes[player][16] || !players_attributes[player][17] || !players_attributes[player][18]) {
	// 			io.to(new_host).emit('addContinueQuestionButton')
	// 			return;
	// 		}
	// 	}
	// }
	// //host left, someone needs the next fake question button

}

function updateGhostPlayersList(players_attributes, ShortName) {
	for (let player in players_attributes) {
		if (players_attributes[player][0] != ShortName && players_attributes[player][19] != true) {
			io.to(player).emit('updateGhostPlayer', {ShortName})
		}
	}
}

function whoIsAGhost(players_attributes) {
	list_of_ghosts = []

	for (let player in players_attributes) {
		if (players_attributes[player][19] == true) {
			list_of_ghosts.push(player)
		}
	}

	return list_of_ghosts
}


function delayBeforeStartRound(players_attributes, function_call_when_done) {
	for (let player in players_attributes) {
		players_attributes[player][21] += 1 
		io.to(player).emit('startRoundDelay', {function_call_when_done})
	};
}

function getRandomFunFact() {
	var randIndex = getRandomInt(fun_facts_list.length - 1)
	return fun_facts_list[randIndex]
}

function getRandomCannedAnswer(playerid) {

	var chosen_ints = [];
	var listRands = [];

	while (chosen_ints.length < 3) {
		var randIndex = getRandomInt(canned_answers_list.length - 1)
		if (chosen_ints.indexOf(randIndex) == -1) {
			chosen_ints.push(randIndex)
			listRands.push(canned_answers_list[randIndex])
		}
	}

	io.to(playerid).emit('receiveCannedAnswer', {listRands})
}

function getGhostAnswers() {
	var chosen_ints = [];
	var listRands = [];

	while (chosen_ints.length < 3) {
		var randIndex = getRandomInt(canned_answers_list.length - 1)
		if (chosen_ints.indexOf(randIndex) == -1) {
			chosen_ints.push(randIndex)
			listRands.push(canned_answers_list[randIndex])
		}
	}
	return listRands
}

function isShortNameUnique(shortName, players_list) {
	for (var i = 1; i < players_list.length; i++) {
		var comp_shortname = all_player_attributes[(players_list[i])][0]
		if (shortName == comp_shortname) {
			return false;
		}
	}

	return true;
}

function update_host(players_list, gameID) {
	var host = find_host(gameID)
	var others_list = [getShortName(host) + ' (you)'];
	for (var i = 2; i < players_list.length; i++) {
		var player = players_list[i]
		var playerShort = getShortName(player)
		others_list.push(" " + playerShort);
	};
	io.to(host).emit('playerUpdate', {others_list});
};

function alertUser(playerid, message) {
	io.to(playerid).emit('serverMsg', {message});
};

function changeHTML(playerid) {
	io.to(playerid).emit('changingHTML');
};

function getShortName(playerId) {
	return (all_player_attributes[playerId])[0]
};

function startGame(game_code, familyBool, getToKnowBool, replayBool) {

	var questions_list_copy = [];

	if (familyBool && getToKnowBool) {
		questions_list_copy = fam_friend_get_to_know_list.slice();
	} else if (familyBool) {
		questions_list_copy = fam_friend_list.slice();
	} else if (getToKnowBool) {
		questions_list_copy = get_to_know_list.slice();
	} else {
		questions_list_copy = no_qualifiers_list.slice();
	}

	if (!replayBool) {
		var players_attributes = {};
		var gameIndex = findGame(game_code);

		for (var i = 0; i < games[gameIndex].length; i++) {
			if (i != 0) {
				var player = (games[gameIndex])[i]
				players_attributes[player] = all_player_attributes[player];
				delete all_player_attributes[player];
				online_players[player] = game_code
				//got user_attributes from global all_player_attributes and added it to game specific players_attributes
				//deleted the user_attributes from the global one
				for (var p = 0; p < 3; p++) {
					var questionlen = questions_list_copy.length;
					var questionindex = getRandomInt(questionlen - 1);
					(players_attributes[player])[p+2] = (questions_list_copy[questionindex]);
					questions_list_copy.splice(questionindex, 1);
				};

				in_process_attributes[game_code] = players_attributes
			};
		};
	} else {

		var players_attributes = in_process_attributes[game_code];

		for (let player in players_attributes) {
			for (var p = 0; p < 3; p++) {
				var questionlen = questions_list_copy.length;
				var questionindex = getRandomInt(questionlen - 1);
				(players_attributes[player])[p+2] = (questions_list_copy[questionindex]);
				questions_list_copy.splice(questionindex, 1);
			};
		}
	}
	
	//this sends out the list of players in the game to the client
	for (let key in players_attributes) {
		var playerID = key
		var shortGuy = players_attributes[playerID][0]
		io.to(playerID).emit('addCookies', {shortGuy, game_code})
		for (let x in players_attributes) {
			var shortName = players_attributes[x][0]
			io.to(playerID).emit('addPlayers', {shortName})
		};
		io.to(playerID).emit('addStartDelay');
	};

	//click submit button or time runs out
};

function storyRound(game_code) {

	var players_attributes = in_process_attributes[game_code];
	var transfers = {};
	var indexes = {};

	var counter = 0;

	for (let x in players_attributes) {
		players_attributes[x][21] = 3
		indexes[counter] = x;
		counter += 1;
	}

	var randsUsed = [];

	var len = Object.keys(indexes).length - 1;

	var rand = getRandomInt(len, 1);
	transfers[0] = rand;
	randsUsed.push(rand);

	for(var i = 1; i <= len; i++) {
	  var added = false;
	  while (!added) {
	    rand = getRandomInt(len);
	    if(!contains(randsUsed, rand)) {
	      if(rand == i && randsUsed.length == len) {
	        yikes(transfers, rand);
	        break;
	      } else if (rand != i) {
	        transfers[i] = rand;
	        added = true;
	        randsUsed.push(rand);
	      }
	    }
	  }
	}

	function contains(array, n) {
	  for(var i = 0; i < array.length; i++) {
	    if(array[i] == n){
	      return true;
	    }
	  }
	  return false;
	}

	function yikes(tran, n) {
	  var temp = len - 1;
	  tran[i] = tran[temp];
	  tran[temp] = n;
	}

	for (let x in transfers) {
		var manipulate_player = indexes[x];
		var manipulated_index = transfers[x];
		var manipulated_player = indexes[manipulated_index];
		((in_process_attributes[game_code])[manipulate_player])[8] = manipulated_player;
		var dispAnswer1 = ((in_process_attributes[game_code])[manipulated_player])[5];
		var dispAnswer2 = ((in_process_attributes[game_code])[manipulated_player])[6];
		var dispAnswer3 = ((in_process_attributes[game_code])[manipulated_player])[7];
		io.to(manipulate_player).emit('takeAnswers', {dispAnswer1, dispAnswer2, dispAnswer3});
	}

};

function displayQuestions(game_code) {
	var players_attributes = in_process_attributes[game_code];
	var temp = sendQuestionsRound(players_attributes)

	var host = find_host(game_code)
	io.to(host).emit('addContinueQuestionButton')
}

function sendQuestionsRound(players_attributes) {

	return randomizeOrder(players_attributes, 'questions')
}

function randomizeOrder(players_attributes, scenarioDeterminer, game_code = 'toast') {

	var donePlayers = [];
	var keys = Object.keys(players_attributes);
	var num_players_in_game = Object.keys(players_attributes).length

	while (donePlayers.length < num_players_in_game) {

		var randPlayerInt = getRandomInt(num_players_in_game - 1)
		var randPlayer = keys[randPlayerInt]

		if (donePlayers.indexOf(randPlayer) < 0) {

			if (scenarioDeterminer == 'stories') {

				if (!players_attributes[randPlayer][11]) {
					sendStory(game_code, randPlayer)
					return false
				} else {
					donePlayers.push(randPlayer)
				}

			} else {

				if (!players_attributes[randPlayer][16] || !players_attributes[randPlayer][17] || !players_attributes[randPlayer][18]) {

					while (true) {
						var randQuestion = getRandomInt(18, 16)
						if (!players_attributes[randPlayer][randQuestion]) {

							sendQuestionsToClient(players_attributes, randPlayer, randQuestion - 3)
							players_attributes[randPlayer][randQuestion] = true;

							if (players_attributes[randPlayer][16] && players_attributes[randPlayer][17] && players_attributes[randPlayer][18]) {
								donePlayers.push(randPlayer)
							}

							return false;
						}
					}

				} else {
					donePlayers.push(randPlayer)
				}
			}
		}
	}

	return true;

}

function sendQuestionsToClient (players_attributes, senderPlayer, questionIndex) {

	var senderShortname = players_attributes[senderPlayer][0]
	var fakeQuestion = players_attributes[senderPlayer][questionIndex]

	for (let player in players_attributes) {
		players_attributes[player][21] = 9
		if (player == players_attributes[senderPlayer][8]) {
			var answererShortname = players_attributes[player][0]
			var realAnswer = players_attributes[player][questionIndex - 8]
			var realQuestion = players_attributes[player][questionIndex - 11]
		}
	};

	for (let player in players_attributes) {
		io.to(player).emit('displayQuestions', {senderPlayer, answererShortname, senderShortname, fakeQuestion, realAnswer, realQuestion})
	};

}

// function displayStories(game_code) {
// 	var host = find_host(game_code)

// 	sendStory(game_code, host)
// };

function sendStory(game_code, player_id) {

	var players_attributes = in_process_attributes[game_code];

	var story = players_attributes[player_id][9]
	var story_title = players_attributes[player_id][10]
	var shortName = players_attributes[player_id][0]

	for (let output_player in players_attributes) {
		players_attributes[output_player][21] = 4
		io.to(output_player).emit('displayStory', {shortName, story, story_title});
	};

	players_attributes[player_id][11] = true

	var host = find_host(game_code)
	io.to(host).emit('addContinueButton')
};

function votingStories(game_code) {

	var players_attributes = in_process_attributes[game_code];
	var storiesList = []

	for (let player in players_attributes) {
		var title = players_attributes[player][10];
		var author = players_attributes[player][0];
		storiesList.push([title, author]);
	};

	for (let output_player in players_attributes) {
		var client_shortname = players_attributes[output_player][0]
		//this is so that the client does not display the drop down with the player's own
		//name in it
		players_attributes[output_player][21] = 5
		io.to(output_player).emit('displayStoryVoting', {storiesList, client_shortname});
	};
};

function showVotes(game_code, players_attributes, lastRoundBoolean) {

	var host = find_host(game_code)
	var scores = sortScores(players_attributes)

	for (let player in players_attributes) {
		players_attributes[player][21] += 1
		io.to(player).emit('displayScores', {scores, lastRoundBoolean})
	};

	if (!lastRoundBoolean) {
		io.to(host).emit('addScoringContinue')
	} else {
		io.to(host).emit('addFinalScreenContinue')

	}
}

function sortScores(players_attributes) {

	var indexes = {};
	var sortedList = [];

	for (let player in players_attributes) {
		var shortName = players_attributes[player][0]
		var score = players_attributes[player][1]
		var temp = [shortName, score];
		sortedList.push(temp)
	};

	sortedList.sort(function(a,b){return b[1] - a[1];});

	for (var i = 0; i < sortedList.length; i++) {
		indexes[(sortedList[i])[0]] = (sortedList[i])[1]
	}

	return indexes;
}

function areConditionsIn(player_id, players_attributes, conditions_list) {
	for (var i = 0; i < conditions_list.length; i++) {
		if (players_attributes[player_id][conditions_list[i]] == '') {
			return false;
		}
	}
	return true;
}

function isLastPlayer(players_attributes, conditions_list) {

	for (let key in players_attributes) {
		var checker = areConditionsIn(key, players_attributes, conditions_list)
		if (checker != true) {
			return false;
		}
	}

	return true;
}

function addOnePlayerToWaitingScreen(player_updating, players_attributes, conditions_list) {

	var done = true
	var first_bool = false;

	for (let key in players_attributes) {
		var checker = areConditionsIn(key, players_attributes, conditions_list)
		if (checker == true && key != player_updating) {
			var shortName = players_attributes[player_updating][0]
			io.to(key).emit('donePlayers', {shortName, first_bool});
		}

		if (!checker) {
			done = false;
		}
	}

	return done;
}

function updateEntireAfterRound(player_id, game_code, conditions_list) {
	var players_attributes = in_process_attributes[game_code];
	var fun_fact = getRandomFunFact();
	var first_bool = true;

	for (let players in players_attributes) {
		var checker = areConditionsIn(players, players_attributes, conditions_list)
		if (checker) {
			var shortName = players_attributes[players][0]
			io.to(player_id).emit('donePlayers', {shortName, first_bool, fun_fact});
		}
	}
}

function sendQuestions(player_id, players_attributes) {
	var question1 = (players_attributes[player_id])[2], question2 = (players_attributes[player_id])[3], question3 = (players_attributes[player_id])[4];
	io.to(player_id).emit('addQuestions', {question1,question2,question3});
}

function readCSV(fileIndex) {

	var listOfFilepaths = ['/server/Question_Bank_v2.csv', '/server/fun_facts.csv', '/server/canned_answers.csv']

	var current_filepath = listOfFilepaths[fileIndex]

	fs = require('fs')
	var filepath = __dirname + current_filepath
	fs.readFile(filepath, 'utf8', function (err,data) {
		var lines = data.split("\n");
		initialize_server(lines, fileIndex);
	});


};

function getRandomInt(max, min = 0) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min + 1) + min); //The maximum is exclusive and the minimum is inclusive
}

function makeid(length) {
   var result           = '';
   var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
   var charactersLength = characters.length;
   for ( var i = 0; i < length; i++ ) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
   }
   return result;
};

function findGame(game_code) {
	//finds position of the game in game list
	for (var i = 0; i < games.length; i++) {
		var firstList = games[i];
		if (firstList[0] == game_code) {
			return i;
		}
	}
	return false;
};

function find_host(game_id) {
	for (var i = 0; i < games.length; i++) {
		var firstList = games[i];
		if (firstList[0] == game_id) {
			return firstList[1];
		}
	}
	return false;
}

function in_game(playerid) {
	//finds if a player is in a game
	for (var i = 0; i < games.length; i++) {
		var firstList = games[i];
		for (var p = 0; p < firstList.length; p++) {
			if (firstList[p] == playerid) {
				return {i, p};
				//if they are in a game, return the position
			}
		}
	}
	return false;	
};

function num_players_in_game(game_code) {
	//checks for the number of players in a game
	for (var i = 0; i < games.length; i++) {
		var firstList = games[i];
		if (firstList[0] == game_code) {
			return firstList.length;
		}
	}
	return false;
};

function destroy_game(game_code) {
	var position = findGame(game_code);
	games.splice(position, 1)
	delete in_process_attributes[game_code]
	delete game_parameters[game_code]
};

function initialize_user_attributes(short_name) {
	var score = 0;
	var q1 = "", q2 = "", q3 = "", a1 = "", a2 = "", a3 = "", f1 = "", f2 = "", f3 = "", done1 = false, done2 = false, done3 = false, answerer = "", story = "", story_title = "", story_read = false, story_vote = false, ghost_bool = false, game_over = false, round_tracker = 0;
	return [short_name, score, q1, q2, q3, a1, a2, a3, answerer, story, story_title, story_read, story_vote, f1, f2, f3, done1, done2, done3, ghost_bool, game_over, round_tracker];
};