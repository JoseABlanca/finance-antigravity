import sys
file_path = r'c:\Users\Jose\Desktop\Antigravity\client\src\pages\QuantReport.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace("left: %,", "left: \${leftShift}%\,")
text = text.replace("width: %,", "width: \${isWidth}%\,")
text = text.replace("left: %,", "left: \${leftShift + isWidth}%\,")
text = text.replace("width: %,", "width: \${oosWidth}%\,")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(text)
print("Fixed backticks!")
