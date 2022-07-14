const { program } = require('commander');
const { setIntervalAsync, clearIntervalAsync } = require('set-interval-async/fixed');
const request = require("request");

require('dotenv').config();

const {
	addDB,
} = require('./src/dbForCovalent.js');

const Web3 = require('web3');
const contractAddress = process.env.CONTRACT_ADDRESS;
const chainId = process.env.CHAIN_ID;
const apiKey = process.env.COVALENT_API_KEY;
const topic = process.env.TOPIC;
const intervalSeconds = process.env.INTERVAL_SECONDS;

const getData = async (web3, fromBlock, blockNumber, pageNumber, pageSize) => {
	console.log(blockNumber + ': Check referals data from height', fromBlock, 'to', blockNumber);
	const url = `https://api.covalenthq.com/v1/${chainId}/events/address/${contractAddress}/?quote-currency=USD&format=JSON&starting-block=${fromBlock}&ending-block=${blockNumber}&page-number=${pageNumber}&page-size=${pageSize}&key=${apiKey}`;
	console.log(url);
	try {
		request({
			url,
			method: "GET",
		},
		async function (error, response, body) {
			if(!error && response.statusCode == 501) {
				console.log('Error: ', data.error_message);
				return;
			}
			if (!error && response.statusCode == 200) {
				const data = JSON.parse(body);
				if(data.error) {
					console.log(data.error_message, data.error_code); 
					return;
				}
				if(data.data.items.length === 0) {
					console.log("No data");
					return;
				}

				for(let i = 0; i < data.data.items.length; i++) {
					const item = data.data.items[i];
					if(item.raw_log_topics.includes(topic)) {
						// console.log(item);
						const transactionHash = item.tx_hash;
						const blockHeight = item.block_height;
						const timestamp = item.block_signed_at;
						const rawLogData = item.raw_log_data;
						const params = web3.eth.abi.decodeParameters(['address', 'address'], rawLogData);
						const referee = params[0];
						const referer = params[1];
						// console.log(i + 1, blockHeight, referee, referer, timestamp)
						addDB({
							chainId,
							referee, 
							referer, 
							timestamp: (new Date(timestamp)).getTime(),
							blockHeight, 
							transactionHash
						});
					}
				}
			}
		});
	} catch (e) {
		console.log("Fetch error: " + url);
	}
}

/**
 * =================================================================
 * Command for cli
 * =================================================================
 */
program
	.allowUnknownOption()
	.version('0.1.0')
	.usage('checkCovalent [options]')

program
	.option('-i --init', 'Initialize, run first time to fetch all history data')
	.option('-r --run', 'Run automatically to fetch data every 20 seconds')

if(!process.argv[2]) program.help();
program.parse(process.argv);

const options = program.opts();
const web3 = new Web3(new Web3.providers.HttpProvider(process.env.RPC_URL));

if(options.fromBlock !== undefined && options.toBlock !== undefined) {
	console.log("params: fromBlock and toBlock must be assigned");
	return;
} else {
	if(options.init !== undefined) {
		console.log("Initializing...");
		web3.eth.getBlockNumber().then((blockNumber) => {
			getData(
				web3, 
				process.env.FROM_BLOCK,
				blockNumber,
				0, 		// increase this num from 1 to no-data
				3000 // Fixed
			);
		})
	} else if(options.run !== undefined) {
		console.log(`Run automaticly every ${intervalSeconds} seconds`);
		setIntervalAsync(async () => {
			web3.eth.getBlockNumber().then((blockNumber) => {
				getData(
					web3, 
					blockNumber - 30,
					blockNumber,
					0, 
					1000
				);
			})
		}, 1000 * intervalSeconds);	
	}
}

