"""Compile original source decoders/validators plus the new adapter; no model mocks.
Unrelated App/SwiftUI declarations are omitted by exact source block extraction.
"""
from pathlib import Path
import subprocess, tempfile
root = Path(__file__).resolve().parents[4]
base = root / 'ios/VisePanda/VisePanda'
def read(path): return (base / path).read_text()
def block(text, start):
    begin = text.index(start); brace = text.index('{', begin); depth = 1; pos = brace+1
    while depth:
        if text[pos] == '{': depth += 1
        if text[pos] == '}': depth -= 1
        pos += 1
    return text[begin:pos]
session = read('App/NativeSession.swift')
support = 'import Foundation\nimport Security\n'
for name in ['struct NativeDataScope:', 'enum NativeDataError:', 'protocol NativeCredentialVault']:
    support += ('@MainActor\n' if name.startswith('protocol') else '') + block(session, name) + '\n'
trip = read('Features/Trip/NativeTripModels.swift')
support += trip[:trip.index('struct NativeTripDraft:')]
support += 'enum NativeScopedTripCommand {\n' + block(read('Features/ScopedTripEdit/NativeScopedTripCommand.swift'), 'static func date(') + '\n}\n'
support += 'enum NativeScreenshotComparison {\n' + block(read('Features/Trip/NativeScreenshotReviewView.swift'), 'static func validDate(') + '\n}\n'
with tempfile.TemporaryDirectory(prefix='vpj13-material-native-') as temp:
    temp = Path(temp); (temp / 'OriginalModels.swift').write_text(support)
    command = ['swiftc','-swift-version','6','-strict-concurrency=complete','-warnings-as-errors', '-o', str(temp/'proof'),str(temp/'OriginalModels.swift')]
    command += [str(base / p) for p in ['Features/PDFIntake/NativePDFDocument.swift','Features/PDFIntake/NativePDFWire.swift','Features/PDFIntake/NativePDFJournal.swift','Features/JourneyMaterialOutcome/NativeJourneyMaterialOutcome.swift']]
    command += [str(Path(__file__).with_name('Proof.swift'))]
    subprocess.run(command, check=True, cwd=root)
    subprocess.run([str(temp/'proof')],check=True,cwd=root)
