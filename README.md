# Invoice PDF Extractor

A simple browser-based tool for extracting key information from Chinese digital invoices (searchable PDFs).  
Built using [PDF.js](https://mozilla.github.io/pdf.js/).

## Features

- Upload multiple invoice PDFs at once
- Extract invoice number, item names, quantities, prices, and tax information
- Copy results to clipboard in Excel-friendly format

## Usage

1. Open the tool in a browser (hosted on [Netlify](https://invoice-pdf-extract.netlify.app/)).
2. Drag and drop invoice PDFs into the upload area.
3. Extracted data will be displayed in a table.
4. Use the "Copy" button to copy data in TSV format.

## Development

This project uses the [pdfjs-dist](https://www.npmjs.com/package/pdfjs-dist) library loaded via CDN.  
The app works when hosted (e.g., Netlify) — it won’t run by double-clicking `index.html` locally because of web worker restrictions.

## License

MIT License (feel free to use or adapt).
