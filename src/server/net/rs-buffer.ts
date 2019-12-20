const BIT_MASKS: number[] = [];

for(let i = 0; i < 32; i++) {
    BIT_MASKS.push((1 << i) - 1);
}

export function stringToLong(s: string): bigint {
    let l: bigint = BigInt(0);

    for(let i = 0; i < s.length && i < 12; i++) {
        const c = s.charAt(i);
        const cc = s.charCodeAt(i);
        l *= BigInt(37);
        if(c >= 'A' && c <= 'Z') l += BigInt((1 + cc) - 65);
        else if(c >= 'a' && c <= 'z') l += BigInt((1 + cc) - 97);
        else if(c >= '0' && c <= '9') l += BigInt((27 + cc) - 48);
    }
    while(l % BigInt(37) == BigInt(0) && l != BigInt(0)) l /= BigInt(37);
    return l;
}

/**
 * Special snowflake byte buffer.
 */
export class RsBuffer {

    private buffer: Buffer;
    private writerIndex: number = 0;
    private readerIndex: number = 0;
    private bitIndex: number;

    public constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    public static create(size: number = 5000): RsBuffer {
        const buffer = Buffer.alloc(size);
        return new RsBuffer(buffer);
    }

    /**
     * Enables the writing of specific bits to the buffer.
     */
    public openBitChannel(): void {
        this.bitIndex = this.writerIndex * 8;
    }

    /**
     * Disables the writing of specific bits to the buffer.
     */
    public closeBitChannel(): void {
        this.writerIndex = Math.floor((this.bitIndex + 7) / 8);
    }

    /**
     * Makes sure the current buffer has the specified space left within it.
     * If not, a new buffer is created that contains the old buffer's data with the required space available at the end.
     * @param remaining The required size remaining.
     */
    public ensureCapacity(remaining: number): void {
        if(this.getReadable() < remaining) {
            const newBuffer = Buffer.alloc(remaining);
            this.buffer.copy(newBuffer, 0, 0);
            this.buffer = newBuffer;
        }
    }

    public writeBytes(fromBuffer: RsBuffer | Buffer): void {
        if(fromBuffer instanceof RsBuffer) {
            fromBuffer = fromBuffer.getData();
        }

        this.ensureCapacity(this.getWriterIndex() + fromBuffer.length);
        fromBuffer.copy(this.getBuffer(), this.getWriterIndex(), 0);
        this.setWriterIndex(this.getWriterIndex() + fromBuffer.length);
    }

    public writeBits(bitCount: number, value: number): void {
        const byteCount: number = Math.ceil(bitCount / 8) + 1;

        this.ensureCapacity(this.writerIndex + byteCount);

        let byteIndex: number = this.bitIndex >> 3;
        let bitOffset: number = 8 - (this.bitIndex & 7);

        this.bitIndex += bitCount;

        for(; bitCount > bitOffset; bitOffset = 8) {
            this.buffer[byteIndex] &= ~BIT_MASKS[bitOffset];
            this.buffer[byteIndex++] |= (value >> (bitCount - bitOffset)) & BIT_MASKS[bitOffset];
            bitCount -= bitOffset;
        }

        if(bitCount == bitOffset) {
            this.buffer[byteIndex] &= ~BIT_MASKS[bitOffset];
            this.buffer[byteIndex] |= value & BIT_MASKS[bitOffset];
        } else {
            this.buffer[byteIndex] &= ~(BIT_MASKS[bitCount] << (bitOffset - bitCount));
            this.buffer[byteIndex] |= (value & BIT_MASKS[bitCount]) << (bitOffset - bitCount);
        }
    }

    public readUnsignedByte(): number {
        return this.buffer.readUInt8(this.readerIndex++);
    }

    public readByte(): number {
        return this.buffer.readInt8(this.readerIndex++);
    }

    public readNegativeOffsetByte(): number {
        return 128 - (this.readByte() & 0xff);
    }

    public readShortBE(): number {
        const value = this.buffer.readInt16BE(this.readerIndex);
        this.readerIndex += 2;
        return value;
    }

    public readUnsignedShortBE(): number {
        const value = this.buffer.readUInt16BE(this.readerIndex);
        this.readerIndex += 2;
        return value;
    }

    public readNegativeOffsetShortLE(): number {
        let value = (this.readByte() - 128 & 0xff) | ((this.readByte() & 0xff) << 8);
        if(value > 32767) {
            value -= 0x10000;
        }

        return value;
    }

    public readIntBE(): number {
        const value = this.buffer.readInt32BE(this.readerIndex);
        this.readerIndex += 4;
        return value;
    }

    public readLongBE(): bigint {
        const value = this.buffer.readBigInt64BE(this.readerIndex);
        this.readerIndex += 8;
        return value;
    }

    public readString(): string {
        const bytes: number[] = [];
        let b: number;

        while((b = this.readByte()) !== 10) {
            bytes.push(b);
        }

        return Buffer.from(bytes).toString();
    }

    public readBytes(length: number): Buffer {
        const result = this.buffer.slice(this.readerIndex, this.readerIndex + length + 1);
        this.readerIndex += length;
        return result;
    }

    public writeByte(value: number): void {
        this.buffer.writeInt8(value, this.writerIndex++);
    }

    public writeByteInverted(value: number): void {
        this.writeByte(-value);
    }

    public writeNegativeOffsetByte(value: number): void {
        this.writeUnsignedByte(128 - value);
    }

    public writeUnsignedByte(value: number): void {
        this.buffer.writeUInt8(value, this.writerIndex++);
    }

    public writeShortBE(value: number): void {
        this.buffer.writeInt16BE(value, this.writerIndex);
        this.writerIndex += 2;
    }

    public writeOffsetShortBE(value: number): void {
        this.writeUnsignedByte(value >> 8);
        this.writeUnsignedByte(value + 128 & 0xff);
    }

    public writeOffsetShortLE(value: number): void {
        this.writeUnsignedByte(value + 128 & 0xff);
        this.writeUnsignedByte(value >> 8);
    }

    public writeIntBE(value: number): void {
        this.buffer.writeInt32BE(value, this.writerIndex);
        this.writerIndex += 4;
    }

    public writeLongBE(value: bigint): void {
        this.buffer.writeBigInt64BE(value, this.writerIndex);
        this.writerIndex += 8;
    }

    public writeString(value: string): void {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(value);

        for(const byte of bytes) {
            this.writeByte(byte);
        }

        this.writeByte(10); // end of line
    }

    public getReadable(): number {
        return this.buffer.length - this.readerIndex;
    }

    public getWritable(): number {
        return this.buffer.length - this.writerIndex;
    }

    public getBuffer(): Buffer {
        return this.buffer;
    }

    /**
     * Gets all of the data currently in the buffer, excluding past the current writer index.
     */
    public getData(): Buffer {
        return this.buffer.slice(0, this.writerIndex);
    }

    public getUnreadData(): Buffer {
        return this.buffer.slice(this.readerIndex, this.buffer.length + 1);
    }

    public getWriterIndex(): number {
        return this.writerIndex;
    }

    public getReaderIndex(): number {
        return this.readerIndex;
    }

    public setWriterIndex(position: number): void {
        this.writerIndex = position;
    }
}
