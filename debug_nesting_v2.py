
import re

def check():
    print("Checking structure...")
    with open('index.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    stack = []
    
    for i, line in enumerate(lines):
        line_num = i + 1
        tags = re.finditer(r'(</?div\b[^>]*>)', line, re.IGNORECASE)
        for match in tags:
            tag = match.group(1)
            is_closing = tag.startswith('</')
            
            if not is_closing:
                stack.append(line_num)
                if 'lg:col-span-1' in line:
                    print(f"[{line_num}] SIDEBAR OPEN. Depth: {len(stack)}")
                if 'lg:col-span-3' in line:
                    print(f"[{line_num}] MAIN PANEL OPEN. Depth: {len(stack)}")
            else:
                if not stack:
                    print(f"[{line_num}] ERROR: Unexpected closing.")
                    return
                opener = stack.pop()
                if line_num == 253:
                     print(f"[{line_num}] Closing... Opener was {opener}. Stack remaining: {len(stack)}")

    print(f"Final Stack Size: {len(stack)}")
    if len(stack) > 0:
        print(f"Remaining items: {stack}")

check()
