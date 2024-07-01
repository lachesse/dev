import axios from 'axios';
import { JSDOM } from 'jsdom';
import { google } from 'googleapis';
import { auth } from 'google-auth-library';

export const handler = async (event) => {
    const videoURL = 'https://www.tiktok.com/@sbmwr/video/7157535162576817414';
    const AUDD_TOKEN = process.env.AUDD_API_TOKEN
    
    async function getVid(vidUrl){
        return await axios.post(
            'https://ssstik.io/abc',
                new URLSearchParams({
                    'id': vidUrl,
                    'locale': 'en',
                    'tt': 'SFdab0xm'
                }),
                {
                    params: {
                    'url': 'dl'
                    },
                    headers: {
                    'authority': 'ssstik.io',
                    'accept': '*/*',
                    'accept-language': 'en-US,en;q=0.9',
                    'cache-control': 'no-cache',
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'hx-current-url': 'https://ssstik.io/download-tiktok-mp3',
                    'hx-request': 'true',
                    'hx-target': 'target',
                    'hx-trigger': '_gcaptcha_pt',
                    'origin': 'https://ssstik.io',
                    'pragma': 'no-cache',
                    'referer': 'https://ssstik.io/download-tiktok-mp3',
                    'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36'
                    }
                }
        );
    
    }

    async function getAuddio(audUrl) {
        const reqUrl = `https://api.audd.io?return=spotify&api_token=${AUDD_TOKEN}&url=${audUrl}`;
        let error;
        try {
            const res = await axios.get(reqUrl)
            return res.data;
        } catch(err) {
            return err;
        }
    }
    
    async function fetchSheet(sheetUrl) {
        // fetch entire sheet, loop through
        //what is trigger, 
        //what is time limit and how is place saved when time limit is reached
        //queue?
        try {
            const response = await sheets.spreadsheets.values.get({
              spreadsheetId: sheetUrl,
              range: 'B2:B', 
            });
            
            return response.data;
            
          } catch (error) {
            return {
              statusCode: 500,
              body: `Failed to fetch data from Google Sheets: ${error}`
            };
        }
    }
    
    // async function updateSheet(audResponseBulk) {
    //     //insert song results into sheet in bulk
    //     // replace entire sheet?
    //     // build/create new sheet entirely instead of inserting into existing?
    // }
    function getHumanReadableTimestamp() {
        const now = new Date();
    
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');  // months are 0-indexed
        const day = String(now.getDate()).padStart(2, '0');
    
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
    
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    
    async function insertDataIntoNewSheet(spreadsheetId, orderedMap) {
    
        const sheetTitle = `Processed ${getHumanReadableTimestamp()}`;  // Using the timestamp function from earlier
    
        // Create a new sheet within the existing spreadsheet
        try {
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: spreadsheetId,
                resource: {
                    requests: [
                        {
                            addSheet: {
                                properties: {
                                    title: sheetTitle
                                }
                            }
                        }
                    ]
                }
            });
        } catch (err) {
            console.error("Failed to create new sheet:", err);
            return;
        }
    
        console.log(`New sheet "${sheetTitle}" created in spreadsheet: ${spreadsheetId}`);
    
        // Prepare the data to be inserted
        const rows = Array.from(orderedMap.values()).map(entry => [
            entry.row, 
            entry.artist, 
            entry.title, 
            entry.label, 
            entry.error
        ]);
    
        // Add headers
        rows.unshift(['URL', 'Artist', 'Title', 'Label', 'Error']);
    
        // Append data to the new sheet
        try {
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: `${sheetTitle}!A1:E${rows.length}`,  // Start from the first cell of the new sheet
                valueInputOption: 'RAW',
                resource: {
                    values: rows
                }
            });
        } catch (err) {
            console.error("Failed to append data:", err);
            return;
        }
    
        console.log(`Data successfully appended to new sheet: ${sheetTitle}`);
    }


    async function processSheetLinks(vidLinkBulk) {
        let orderedMap = new Map();
        const rows = vidLinkBulk.values;
        let nonEmptyRows;
        if (rows && rows.length) {
          nonEmptyRows = rows.filter(row => row[0] !== "");
        } else {
          console.log('No data found.');
          return;
        }

        const promises = nonEmptyRows.map(async (row, index) => {
            let rowErr;
            let audioLink;
            let artist, title, label;
            try {
                const vidText = await getVid(row[0]);
                console.log(`vidText: ${vidText}`)
                const dom = new JSDOM(vidText.data);
                
                const linkElement = dom.window.document.querySelector('a.download_link.music');
                
                if (linkElement) {
                    audioLink = linkElement.getAttribute('href');
                    let songRec = await getAuddio(audioLink);
                    ({artist, title, label} = songRec.result);
                } else {
                    console.log('Link with the desired class not found');
                    // rowErr = 'Failed to download tiktok';
                    rowErr = vidText;
                }
                
            } catch(err) {
                rowErr = err;
            }
            
            orderedMap.set((index+2), {
                row: row[0],
                artist,
                title,
                label,
                error: rowErr
            });
        });
    
        await Promise.all(promises);
        // console.log(orderedMap)
        return orderedMap;
    }

    
    async function initializeSheetsAPI() {
      const client = auth.fromJSON(gc);
      client.scopes = ['https://www.googleapis.com/auth/spreadsheets'];
      sheets = google.sheets({version: 'v4', auth: client});
    }
    
    const googleCredentials = process.env.GOOGLE_CREDENTIALS;
    const gc = JSON.parse(googleCredentials)
    let sheets;
    
    if (!sheets) {
        await initializeSheetsAPI();
    }

    const spreadId = '1j6_noHrBnrh_K4rRw_fiy2pitXLnPv7NYzHChEsYTpI';
    const fetchedSheet = await fetchSheet(spreadId);
    const processed = await processSheetLinks(fetchedSheet);
    console.log(processed)
    const updatedSheet = await insertDataIntoNewSheet(spreadId, processed);
    return updatedSheet
};
