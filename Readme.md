# Intercom Postman Collection

- A Postman Collection file for the [Intercom API](http://developers.intercom.com/reference)
- Will allow you to make requests to the Intercom API
- Based on curl samples on http://developers.intercom.com/reference
- Compatible with [Postman](https://www.getpostman.com/) and [Insomnia](https://insomnia.rest/)


# Setup 
## 1. Importing
- Use the `intercom-postman-collection.json` listed in the repository

### Postman
- Import > Import File

![import - Postman](/docs/Import-Postman.png)

### Insomnia
- Main Menu > Import/Export > Import Data

![import - Insomnia](/docs/Import-Insomnia.png)

## 2. Getting Access Token

- Get your Intercom Access Token from the [Developer Hub](https://app.intercom.io/developers/)

![Intercom access token](/docs/AccessToken-Apply.png)

- Note: some API endpoints require an [Extended Access Token](https://developers.intercom.com/docs/personal-access-tokens#section-extended-scopes)
   - If you try to access these endpoints with a Standard Token you will get a `Not authorized to access resource` error (full error details shown below)
   - Ensure to apply for an extended access token

```
"errors": [
	{
		"code": "token_unauthorized",
		"message": "Not authorized to access resource"
	}
]
```

## 3. Configure your environment variables
- Create an `AccessToken` variable with the value of your access token obtained in the previous step

### Postman
- Environment Options > Manage Environments > Add

![configuration - Postman](/docs/Configuration-Postman.png)

### Insomnia
- Environments dropdown > Manage Environments > + 

![configuration - Insomnia](/docs/Configuration-Insomnia.png)


# Extracting the latest Postman collection
- Code for the extracting is in the `extract` folder
- It downloads the latest developer docs page and extracts out the curl commands and transforms them into the apporpriate
- Requirements: [NodeJS](https://nodejs.org/) and [npm](https://www.npmjs.com/)
- Usage
```
# change to directory with code
cd extract

# install dependencies
npm install

# run extractor to generate `intercom-postman-collection.json` file to be imported
node index.js
```
