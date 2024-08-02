import os
import json
import logging

# Set up the logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    request_headers = event['Records'][0]['cf']['request']['headers']
    print(f"Request Processed In: {os.environ['AWS_REGION']}")

    header_table = '<table border="1" width="100%"><thead><tr><td><h1>Header</h1></td><td><h1>Value</h1></td></tr></thead><tbody>'
    for key, value in request_headers.items():
        header_table += f"<tr><td>{key}</td><td>{value[0]['value']}</td></tr>"
    header_table += "</tbody></table>"
    
    content = f"""<html lang="en">
                    <body>
                        <table border="1" width="100%">
                        <thead>
                            <tr><td><h1>Lambda@Edge </h1></td></tr>
                        </thead>
                        <tfoot>
                            <tr><td>Lamdba@Edge </td></tr>
                        </tfoot>
                        <tbody>
                            <tr><td>Response sent by Lambda@Edge in {os.environ['AWS_REGION']}</td></tr>
                        </tbody>
                        <tbody>
                        <tr><td>{header_table}</td></tr>
                        </tbody>
                        </table>
                    </body>
                </html>"""

    response = {
        'status': '200',
        'statusDescription': 'OK',
        'headers': {
            'cache-control': [{'key': 'Cache-Control', 'value': 'max-age=100'}],
            'content-type': [{'key': 'Content-Type', 'value': 'text/html'}],
            'content-encoding': [{'key': 'Content-Encoding', 'value': 'UTF-8'}]
        },
        'body': content
    }
    
    return response