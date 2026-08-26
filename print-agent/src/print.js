import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';

function printToWindowsSpooler(printerName, payload) {
  return new Promise((resolve, reject) => {
    const cleanName = printerName.replace(/^win:/i, '').trim();
    const tempFile = path.join(os.tmpdir(), `aimerc-raw-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
    
    fs.writeFile(tempFile, payload, (writeErr) => {
      if (writeErr) return reject(new Error(`Falha ao criar arquivo temporario de impressao: ${writeErr.message}`));
      
      const psScript = `
$printerName = "${cleanName.replace(/"/g, '`"')}";
$filePath = "${tempFile.replace(/\\/g, '\\\\')}";
$bytes = [System.IO.File]::ReadAllBytes($filePath);

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes) {
        IntPtr hPrinter = new IntPtr(0);
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "AiMerc Pedido";
        di.pDataType = "RAW";
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di)) {
                if (StartPagePrinter(hPrinter)) {
                    IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int dwWritten = 0;
                    WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
            return true;
        }
        return false;
    }
}
"@;

$success = [RawPrinterHelper]::SendBytesToPrinter($printerName, $bytes);
if (-not $success) {
    throw "Nao foi possivel enviar dados para a impressora $printerName via Spooler do Windows.";
}
`;

      execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], (psErr, stdout, stderr) => {
        fs.unlink(tempFile, () => {});
        if (psErr) reject(new Error(stderr || psErr.message));
        else resolve();
      });
    });
  });
}

export function sendRawToPrinter(host, port, payload, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    const target = (host || '').trim();
    if (!target) return reject(new Error('Destino de impressao nao informado'));
    
    // 1. Se for impressora USB/Spooler Windows (prefixo win: ou nome direto da impressora no Windows)
    if (target.startsWith('win:') || (process.platform === 'win32' && !target.includes('.') && !target.startsWith('\\\\') && !/^(COM|LPT)\d+$/i.test(target))) {
      printToWindowsSpooler(target, payload).then(resolve).catch(reject);
      return;
    }
    
    // 2. Se for caminho de rede Windows (\\localhost\Impressora) ou porta local direta (COM3, LPT1)
    if (target.startsWith('\\\\') || target.startsWith('//') || /^(COM|LPT)\d+$/i.test(target)) {
      fs.writeFile(target, payload, (err) => {
        if (err) reject(new Error(`Falha ao imprimir em ${target}: ${err.message}`));
        else resolve();
      });
      return;
    }

    // 3. Rede TCP/IP (Host/IP e Porta)
    const socket = net.createConnection({ host: target, port: Number(port || 9100) }, () => {
      socket.write(payload, error => {
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        socket.end();
      });
    });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timeout ao conectar na impressora de rede ${target}:${port}`));
    }, timeoutMs);

    socket.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });

    socket.on('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
