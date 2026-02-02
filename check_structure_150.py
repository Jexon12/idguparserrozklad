
import re

def check():
    with open('index.html', 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    stack = []
    
    # Start deeper, knowing we are inside Grid > Sidebar > Filters > v-else > Student
    # But let's run from start to be sure.
    
    for i, line in enumerate(lines[:200]):
        line_num = i + 1
        tags = re.finditer(r'(</?div\b[^>]*>)', line, re.IGNORECASE)
        for match in tags:
            tag = match.group(1)
            is_closing = tag.startswith('</')
            
            if not is_closing:
                stack.append(line_num)
            else:
                if stack:
                    opener = stack.pop()
                    if 140 <= line_num <= 160:
                        print(f"[{line_num}] Closed {opener}. Stack: {len(stack)}")
                else:
                    print(f"[{line_num}] ERROR: Empty stack.")

check()
