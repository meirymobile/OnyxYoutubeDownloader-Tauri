import base64
import struct

def generate_serato_markers2_payload(cues: list) -> bytes:
    """
    Generates the Base64 payload for a Serato Markers2 GEOB tag.
    cues is a list of dicts: {'index': 0, 'posMs': 15000, 'color': (r,g,b), 'name': 'Drop'}
    """
    payload = bytearray()
    
    for cue in cues:
        # CUE string (latin1) + null terminator
        payload.extend(b"CUE\x00")
        
        # Build the body
        index = cue.get('index', 0)
        pos_ms = int(cue.get('posMs', 0))
        r, g, b = cue.get('color', (204, 0, 0)) # default red
        name = cue.get('name', 'Cue').encode('utf-8')
        
        # body: 0x00, index(1), pos(uint32 BE ms), 0x00, color(3), 0x00 0x00, name(null-term)
        body = bytearray()
        body.append(0x00)
        body.append(index & 0xFF)
        body.extend(struct.pack(">I", pos_ms))
        body.append(0x00)
        body.append(r & 0xFF)
        body.append(g & 0xFF)
        body.append(b & 0xFF)
        body.append(0x00)
        body.append(0x00)
        body.extend(name)
        body.append(0x00)
        
        # length of body
        payload.extend(struct.pack(">I", len(body)))
        
        # append body
        payload.extend(body)
        
    # base64 encode payload
    b64_str = base64.b64encode(payload).decode('ascii')
    
    # Outer structure: 0x01 0x01 followed by base64
    final_data = b'\x01\x01' + b64_str.encode('ascii')
    return final_data
