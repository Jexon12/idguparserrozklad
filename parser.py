import argparse
import pandas as pd
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import time
import sys

def get_schedule(employee_name, start_date_str=None, end_date_str=None):
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=False) # Headless=False to see what's happening
        page = browser.new_page()
        
        print(f"Navigating to site...")
        page.goto("http://wp-fuaid.zzz.com.ua/rozklad_copy.html")
        
        # Wait for load
        page.wait_for_load_state("networkidle")
        
        # Select Faculty 'ФУАІД' (Value: 7FR9L1MPGGWN)
        print("Selecting Faculty: ФУАІД")
        page.select_option(".ait-schedlfind-fac", value="7FR9L1MPGGWN")
        
        # Wait for employees to load
        time.sleep(2) 
        
        # Select Employee
        print(f"Selecting Employee: {employee_name}")
        # Get all options to find the value for the name
        options = page.locator(".ait-schedlfind-emp option").all()
        employee_value = None
        for option in options:
            if employee_name.lower() in option.text_content().lower():
                employee_value = option.get_attribute("value")
                break
        
        if not employee_value:
            print(f"Error: Employee '{employee_name}' not found in the list.")
            browser.close()
            return None

        page.select_option(".ait-schedlfind-emp", value=employee_value)
        
        # Set Dates
        if start_date_str and end_date_str:
            start_str = start_date_str
            end_str = end_date_str
        else:
            # Default to next 30 days
            start_date = datetime.now()
            end_date = start_date + timedelta(days=30)
            start_str = start_date.strftime("%d.%m.%Y")
            end_str = end_date.strftime("%d.%m.%Y")
        
        print(f"Setting date range: {start_str} - {end_str}")
        
        try:
            page.fill(".ait-schedlfind-dfrom", start_str)
            page.fill(".ait-schedlfind-dto", end_str)
        except:
            # Fallback if specific classes fail, though they should exist
            pass

        # Click 'Вивести'
        print("Clicking 'Вивести'...")
        page.click(".ait-schedlfind-go")
        
        # Wait for result
        time.sleep(3)
        
        # Check for "No data" message
        content = page.content()
        if "дані відсутні" in content:
            print("No schedule data found for this period.")
            browser.close()
            return pd.DataFrame() # Empty DF
            
        # Extract Table
        print("Extracting table data...")
        try:
            html = page.inner_html(".ait-schedl-container")
        except:
            print("Could not find schedule container.")
            browser.close()
            return None

        browser.close()
        
        return parse_html_to_df(html)

def parse_html_to_df(html_content):
    # Use pandas to parse HTML
    dfs = pd.read_html(html_content)
    if not dfs:
        return None
    
    df = dfs[0]
    return df

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Scrape schedule.')
    parser.add_argument('--name', type=str, default="Абросімов Євгеній Олександрович", help='Employee name')
    parser.add_argument('--start', type=str, help='Start date (DD.MM.YYYY)')
    parser.add_argument('--end', type=str, help='End date (DD.MM.YYYY)')
    args = parser.parse_args()
    
    df = get_schedule(args.name, args.start, args.end)
    
    if df is not None and not df.empty:
        filename = "schedule.xlsx"
        df.to_excel(filename, index=False)
        print(f"Schedule saved to {filename}")
        print(df)
    elif df is not None:
        print("Created empty result (no data found).")
    else:
        print("Failed to extract schedule.")
