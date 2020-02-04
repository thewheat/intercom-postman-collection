const request = require('request');
const parse = require('parse-curl')
const fs = require("fs");
const cheerio = require('cheerio');

const outputTempDevDocsHTML = "intercom-dev-docs.html"
const outputTempDevDocsToJsonFile = "intercom-dev-doc-extract.json"
const outputFinalPostmanFile =  "intercom-postman-collection.json";
const URL = "https://developers.intercom.com/reference";

function readFile(dataFile){
	return fs.readFileSync(dataFile);
}
function readJsonFromFile(dataFile){
	return JSON.parse(fs.readFileSync(dataFile));
}

function writeJSONToFile(input, outputFile){
	const content = JSON.stringify(input, null, 2);
	fs.writeFileSync(outputFile, content, 'utf8', function (err) {
		if (err) {
			console.error("ERROR: Could not write file (" + outputFile + ")\n", err);
		}
	}); 
}

function writeToFile(content, outputFile){
	fs.writeFileSync(outputFile, content, 'utf8', function (err) {
		if (err) {
			console.error("ERROR: Could not write file (" + outputFile + ")\n", err);
		}
	}); 
}

// Read custom JSON that describe developer docs and convert it into a file for Postman
// Needs to be of the following format
//    data[categoryname] = [
//		{
//			header:
//			subheader:
//			code:
//		}
//    ]
function createPostmanOutput(data){
	var postmanItems = [];	
	for(var category in data){
		var categoryData = data[category];
		var postmanCategoryOutput = {
			name: category,
			description: "",
			item: []
		}
		categoryData.forEach(function(item){
			if (!item.code.match(/curl/)) return;
			var code = item.code.replace(/^\#.*\n/m,"").replace(/^\$ /, "").replace(/-d'$/m, "-d '").replace(/:Bearer/gm, ": Bearer").replace(/:application/gm, ": application").replace(/curl \\/gm, "curl ");
			if(code.match(/-d\s*$/m)){
				code = code.replace(/-d\s*$/m, "-d '");
				code += "'";
				code = code.replace(/-d ''/m,"");
			}
			var curl = null;
			var extra = "";
			try
			{
				curl = parse(code);
			}
			catch(e){
			}

			if(!curl){
				console.error("=======================================================================================\n" + 
				              "ERROR: Can't parse curl for " + category + ": " + item.header + (item.subheader ? " (" + item.subheader + ")": "") +"\n" + 
				              "---------------------------------------------------------------------------------------\n", 
				              );
				console.error("original  code\n", item.code);
				console.error("sanitized code\name", code);
			}
			else{
				postmanCategoryOutput.item.push(createPostmanEntry(item, curl));
			}
		});
		if(postmanCategoryOutput.item.length > 0)
			postmanItems.push(postmanCategoryOutput);
	}
	return {
		"variables": [],
		"info": {
			"name": "Intercom API",
			"description": "A collection of examples of how to interact with the various endpoints of the Intercom API based on https://developers.intercom.com/reference",
			"schema": "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
		},
		"item": postmanItems
	}
}

// Create a single Postman Entry based on custom JSON that describes a single code block in the developer docs
// Item format: { header: , subheader: }
// Output file Will print request text as: "header (subheader)"
function createPostmanEntry(item, curl){
	var headers = [];
	for(var key in curl.header){
		headers.push({
			key: key,
			value: (key == "Authorization") ? "Bearer {{AccessToken}}" : curl.header[key],
			description: ""
		})
	}
	var name = item.header;
	if(item.subheader) {
		item.subheader = item.subheader.replace(/Request & Response\s*/g, "");
		if(item.subheader){
			name += " (" + item.subheader + ")";
		}
	}
	var entry = {
		"name": name,
		"request": {
			"url": curl.url,
			"method" : curl.method,
			"header" : headers,
			"description": ""
		},
		"response": []
	}

	if(curl.body){
		entry.request.body = {
			"mode": "raw",
			"raw": curl.body
		}
	}
	return entry;
}

// From raw HTML of the page, extract Json file to represent actual code blocks
// Returns:
//    entries[categoryname] = [
//		{
//			header:
//			subheader:
//			code:
//		}
//    ]
function convertDeveloperWebsiteHTMLToJson(body){
	const $ = cheerio.load(body)
	var entries = {};
	var codeLookup = {};

	// get all codeblocks from website
	$("#readme-data-docs").data("json").forEach(function(item){
		var codeBlocks = findCodeBlocks(item);
		codeBlocks.forEach(function(codeBlock){
			if(!codeLookup[codeBlock.id]) codeLookup[codeBlock.id] = []
			codeLookup[codeBlock.id].push(codeBlock);
		});
	})

	// get list of categories and requests from sidebar
	$(".hub-sidebar-category h3").each(function(){
		item = $(this);
		const category = item.text();

		item.parent().find("li").each(function(){
			li = $(this);

			const title = li.text();
			const extractID = li.attr("ng-class").match(/isActive\('([^']+)'/)
			if(extractID){
				var codeBlocks = codeLookup[extractID[1]];
				if(codeBlocks){
					codeBlocks.forEach(codeBlock => {
						var entry = {
							"header": title || codeBlock.title,
							"subheader": codeBlock.subheader.trim().
							                                 replace(/^\*\*/gi, "").
							                                 replace(/\*\*$/gi, "").
							                                 replace(/^example /gi, "").
							                                 replace(/ ?request$/gi, "").
							                                 trim(),
							"code": codeBlock.code
						}
						if(!entries[category]) entries[category] = [];
						entries[category].push(entry);
					});
				}
			}
			else{
				console.error(`Could not extract ID for ${title}. Extracting from: ${li.attr("ng-class")}`);
			}
		});
	});
	return entries;
}

function createPostmanCollection(input, output){
	var postmanOutput = createPostmanOutput(readJsonFromFile(input));
	writeJSONToFile(postmanOutput,output);
}


////////////////////////////////////////////////////////////////////
// look for all code blocks in this section/item
// returns [{id:, category_id:, title:, subheader: , code: }]
//
// Request will show up as
//    Category
//       Title (subheader)
//       Title (subheader)
function findCodeBlocks(item){
	const text = item.body;
	var blocks = []
	var start = 0;
	var pos_start = -1;
	var block = null;
	var subheader = null;
	var code = null;
	var currentSubheader = {text: ''};
	do{
		if(subheader != null && code != null){
			if(subheader.new_start < code.new_start){
				currentSubheader = subheader;
				subheader = null;
			}
		}
		if(code != null){
			codeBlockJson = JSON.parse(code.block);
			curlCommands = codeBlockJson.codes.filter(x => x.language == "curl" && x.name != 'cURL HTTP Response' && x.name != 'cURL HTTP Request' && x.name != 'cURL HTTP Respnse');
			curlCommands.forEach(curlCommand => {
				blocks.push({
					id: item._id,
					category_id: item.category_id,
					title: item.title,
					subheader: currentSubheader.text,
					code: curlCommand.code
				});
			});
			start = code.new_start;
		}
		code = findCodeBlock(text, start);
		subheader = findSubheaderBlock(text, start);
	}
	while(code != null || subheader != null);
	return blocks;
}


////////////////////////////////////////////////////////////////////
// data extraction from Readme custom code blocks

const START_BLOCK_SUB_HEADER = "[block:textarea]";
const START_BLOCK_CODE = "[block:code]";
const END_BLOCK = "[/block]";

function findCodeBlock(text, start_position)
{
	return findBlock(text, "Code", START_BLOCK_CODE, END_BLOCK, start_position);
}
function findSubheaderBlock(text, start_position)
{
	const block = findBlock(text, "Subheader", START_BLOCK_SUB_HEADER, END_BLOCK, start_position);
	if(block == null) return null;
	block.text = JSON.parse(block.block).text;
	return block;
}
function findBlock(text, type, start_text, end_text, start_position)
{
	var start = text.indexOf(start_text, start_position);
	if(start == -1) return null;
	var end = text.indexOf(end_text , start);
	if(end == -1) return null;


	var block = text.substring(start + start_text.length, end);
	return {
		new_start: end + end_text.length,
		block: block,
		type: type
	}
}
////////////////////////////////////////////////////////////////////

// Do the download and extraction
console.log(`Downloading dev docs: ${URL}....`);

const do_download = false;
if(do_download){
	request.get(URL, function (error, response, body) {
		error = false;
		if(error){
			console.error("ERROR: Could not download page", error);
		}
		else {
			writeToFile(body, outputTempDevDocsHTML);
			if (response.statusCode != 200){
				console.warn("WARNING: Expected response code of 200 but got " + response.statusCode + ". Data may not be properly returned but will try parsing anyway");
			}
			var entries = convertDeveloperWebsiteHTMLToJson(body);
			writeJSONToFile(entries, outputTempDevDocsToJsonFile);
			createPostmanCollection(outputTempDevDocsToJsonFile, outputFinalPostmanFile);
		}
	});
}
else{
	createPostmanCollection(outputTempDevDocsToJsonFile, outputFinalPostmanFile);
}


