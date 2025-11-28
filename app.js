import { extractText } from "./pdfParser.js";
import {
  mainContainer,
  fileInput,
  fileStatus,
  dropArea,
  copyButton,
  clearButton,
  renderTable,
  clearPage,
  renderClick,
  displayColumns,
} from "./uiManager.js";

const allFilesData = [];

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

dropArea.addEventListener("dragover", () => dropArea.classList.add("highlight"));
dropArea.addEventListener("dragleave", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("drop", () => dropArea.classList.remove("highlight"));
dropArea.addEventListener("click", () => fileInput.click());
dropArea.addEventListener("drop", (event) => handleFiles(event.dataTransfer.files), false);
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

async function handleFiles(files) {
  mainContainer.style.animationPlayState = "running";

  const selectedPDFFiles = Array.from(files).filter((file) => file.name.toLowerCase().endsWith(".pdf"));

  clearPage();
  allFilesData.length = 0;

  fileStatus.textContent = `${selectedPDFFiles.length} PDF files selected`;

  await processPDFFiles(selectedPDFFiles);

  // Let the loading animation linger 1 second after task finishes, especially nice for small tasks that end early
  setTimeout(() => {
    mainContainer.style.animationPlayState = "paused";
  }, 1000);
}

async function processPDFFiles(PDFFiles) {
  const processingPromises = PDFFiles.map(processFile);
  try {
    const results = await Promise.all(processingPromises);
    results.forEach((fileData) => {
      if (fileData) {
        allFilesData.push(fileData);
      }
    });
    renderTable(allFilesData);
    fileStatus.textContent = `${PDFFiles.length} PDF file(s) processed successfully.`;
    window.scrollTo({ left: 0, top: document.body.scrollHeight, behavior: "smooth" });
  } catch (error) {
    console.error("An error occurred during batch processing:", error);
    fileStatus.textContent = `Error: ${error.message}`;
  } finally {
    fileInput.value = null;
  }
}

function processFile(file) {
  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();
    fileReader.onload = async () => {
      try {
        const typedarray = new Uint8Array(fileReader.result);
        const parsedData = await extractText(typedarray, file.name);
        resolve(parsedData);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        reject(new Error(`Failed to process ${file.name}`));
      }
    };
    fileReader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    fileReader.readAsArrayBuffer(file);
  });
}

clearButton.addEventListener("click", () => {
  clearPage();
  allFilesData.length = 0;
  renderClick(clearButton);
});

copyButton.addEventListener("click", () => {
  writeDataToClipboard();
  renderClick(copyButton);
});

function writeDataToClipboard() {
  const allLines = allFilesData.flatMap((file) => file.lineItems);

  if (allLines.length === 0) {
    navigator.clipboard.writeText("https://isotropic.org/papers/chicken.pdf");
    return;
  }

  const headerString = displayColumns.map((column) => column.name).join("\t");

  const lineStrings = allLines.map((lineItem) => {
    return displayColumns
      .map((column) => {
        let value = lineItem[column.name];
        if (column.name === "发票号码") {
          // When pasted into Excel, can be treated as text instead of big number
          value = `\'${value}`;
        }
        return value !== null && value !== undefined ? value : "";
      })
      .join("\t");
  });

  const tsv = [headerString, ...lineStrings].join("\n");
  navigator.clipboard.writeText(tsv);
}
