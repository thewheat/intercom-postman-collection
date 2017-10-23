const request = require('request');
const parse = require('parse-curl')
const fs = require("fs");
const cheerio = require('cheerio');

const outputTempDevDocsToJsonFile = "intercom-dev-doc-extract.json"
const outputFinalPostmanFile =  "intercom-postman-collection.json";
const URL = "https://developers.intercom.com/reference";

function readJsonFromFile(dataFile){
	return JSON.parse(fs.readFileSync(dataFile));
}

function writeJSONToFile(input, outputFile){
	const content = JSON.stringify(input);
	fs.writeFileSync(outputFile, content, 'utf8', function (err) {
		if (err) {
			console.error("ERROR: Could not write file (" + outputFile + ")\n", err);
		}
	}); 
}


// Read custom JSON that describe developer docs and convert it into a file for Postman
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
			var code = item.code.replace(/^\#.*\n/m,"").replace(/^\$ /, "").replace(/-d'$/m, "-d '");
			var curl = parse(code);
			if(!curl){
				console.error("=======================================================================================\n" + 
							  "ERROR: Can't parse curl for " + category + ": " + item.header + (item.subheader ? " (" + item.subheader + ")": "") +"\n" + 
							  "---------------------------------------------------------------------------------------\n", 
							  item.code);
			}
			else{
				postmanCategoryOutput.item.push(createPostmanEntry(item, curl));
			}
		});
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
		name += " (" + item.subheader.replace(/^example /gi, "").replace(/ request$/gi, "") + ")";
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
function convertDeveloperWebsiteHTMLToJson(body){
	const $ = cheerio.load(body)
	var entries = {};
	$(".block-code-header a").each(function(i){
		var element = $(this);
		var text = element.text();
		// only extract code sections that are for curl requests
		if(text.match(/curl/gi) && !text.match(/http/gi)){
			convertWebsiteSectionToJson(element, entries, $);
		}
	})
	return entries;
}


// Converts a code section from website into custom Json object that represents the code section
function convertWebsiteSectionToJson(element, entries, $){
	var anchor = null;
	var header = null;
	var category = "Unknown";
	var entry = {
		"header": "",
		"subheader": "",
		"code": ""
	}

	// link has an "ng-click" attribute of the following format "showCode(0)" that indicates which 
	var index = parseInt(element.attr("ng-click").replace(/[showCode()]/g,""));
	if(isNaN(index)) index = 0;
	var code = element.closest(".magic-block-code").find(".block-code-code code").eq(index);
	var codeHeader = element.closest(".magic-block-code").prev();
	
	var parent = element.closest(".hub-reference");	
	if(parent){
		header = parent.find(".hub-reference-section-top h2").eq(0);
		anchor = parent.find("a.anchor-page-title").eq(0);
	}
	if (header){
		entry["header"] = header.text().trim();
	}
	if(codeHeader && codeHeader.hasClass("magic-block-textarea")){
		entry["subheader"] = codeHeader.text().trim();
	}
	if (anchor){
		anchor = anchor.attr("id")
		category = $("#hub-sidebar-content a[href=#" + anchor + "]").closest(".hub-sidebar-category").find("h3").eq(0).text() || "Unknown"
	}
	if (code){
		entry["code"] = code.text().trim();
	}
	if(!entries[category]) entries[category] = [];
	entries[category].push(entry);
}


// Do the download and extraction
request.get(URL, function (error, response, body) {
	if(error){
		console.error("ERROR: Could not download page", error);
	}
	else {
		if (response.statusCode != 200){
			console.warn("WARNING: Expected response code of 200 but got " + response.statusCode + ". Data may not be properly returned but will try parsing anyway");
		}
		var entries = convertDeveloperWebsiteHTMLToJson(body);
		writeJSONToFile(entries, outputTempDevDocsToJsonFile);
		var postmanOutput = createPostmanOutput(readJsonFromFile(outputTempDevDocsToJsonFile));
		writeJSONToFile(postmanOutput,outputFinalPostmanFile);
	}
});

