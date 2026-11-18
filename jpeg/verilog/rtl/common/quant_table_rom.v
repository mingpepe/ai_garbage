// ITU-T T.81 Annex K Q50 Quantization Table ROM + Q20 Reciprocals
// table_sel: 0 = Luminance (Y), 1 = Chrominance (Cb/Cr)
module quant_table_rom (
    input  wire        table_sel,
    input  wire [5:0]  raster_idx,
    output reg  [7:0]  q_val,
    output reg  [20:0] inv_q_q20
);

    always @(*) begin
        if (table_sel == 1'b0) begin
            case (raster_idx)
                6'd0: begin q_val = 8'd16; inv_q_q20 = 21'd65536; end
                6'd1: begin q_val = 8'd11; inv_q_q20 = 21'd95326; end
                6'd2: begin q_val = 8'd10; inv_q_q20 = 21'd104858; end
                6'd3: begin q_val = 8'd16; inv_q_q20 = 21'd65536; end
                6'd4: begin q_val = 8'd24; inv_q_q20 = 21'd43691; end
                6'd5: begin q_val = 8'd40; inv_q_q20 = 21'd26215; end
                6'd6: begin q_val = 8'd51; inv_q_q20 = 21'd20561; end
                6'd7: begin q_val = 8'd61; inv_q_q20 = 21'd17190; end
                6'd8: begin q_val = 8'd12; inv_q_q20 = 21'd87382; end
                6'd9: begin q_val = 8'd12; inv_q_q20 = 21'd87382; end
                6'd10: begin q_val = 8'd14; inv_q_q20 = 21'd74899; end
                6'd11: begin q_val = 8'd19; inv_q_q20 = 21'd55189; end
                6'd12: begin q_val = 8'd26; inv_q_q20 = 21'd40330; end
                6'd13: begin q_val = 8'd58; inv_q_q20 = 21'd18079; end
                6'd14: begin q_val = 8'd60; inv_q_q20 = 21'd17477; end
                6'd15: begin q_val = 8'd55; inv_q_q20 = 21'd19066; end
                6'd16: begin q_val = 8'd14; inv_q_q20 = 21'd74899; end
                6'd17: begin q_val = 8'd13; inv_q_q20 = 21'd80660; end
                6'd18: begin q_val = 8'd16; inv_q_q20 = 21'd65536; end
                6'd19: begin q_val = 8'd24; inv_q_q20 = 21'd43691; end
                6'd20: begin q_val = 8'd40; inv_q_q20 = 21'd26215; end
                6'd21: begin q_val = 8'd57; inv_q_q20 = 21'd18397; end
                6'd22: begin q_val = 8'd69; inv_q_q20 = 21'd15197; end
                6'd23: begin q_val = 8'd56; inv_q_q20 = 21'd18725; end
                6'd24: begin q_val = 8'd14; inv_q_q20 = 21'd74899; end
                6'd25: begin q_val = 8'd17; inv_q_q20 = 21'd61681; end
                6'd26: begin q_val = 8'd22; inv_q_q20 = 21'd47663; end
                6'd27: begin q_val = 8'd29; inv_q_q20 = 21'd36158; end
                6'd28: begin q_val = 8'd51; inv_q_q20 = 21'd20561; end
                6'd29: begin q_val = 8'd87; inv_q_q20 = 21'd12053; end
                6'd30: begin q_val = 8'd80; inv_q_q20 = 21'd13108; end
                6'd31: begin q_val = 8'd62; inv_q_q20 = 21'd16913; end
                6'd32: begin q_val = 8'd18; inv_q_q20 = 21'd58255; end
                6'd33: begin q_val = 8'd22; inv_q_q20 = 21'd47663; end
                6'd34: begin q_val = 8'd37; inv_q_q20 = 21'd28340; end
                6'd35: begin q_val = 8'd56; inv_q_q20 = 21'd18725; end
                6'd36: begin q_val = 8'd68; inv_q_q20 = 21'd15421; end
                6'd37: begin q_val = 8'd109; inv_q_q20 = 21'd9620; end
                6'd38: begin q_val = 8'd103; inv_q_q20 = 21'd10181; end
                6'd39: begin q_val = 8'd77; inv_q_q20 = 21'd13618; end
                6'd40: begin q_val = 8'd24; inv_q_q20 = 21'd43691; end
                6'd41: begin q_val = 8'd35; inv_q_q20 = 21'd29960; end
                6'd42: begin q_val = 8'd55; inv_q_q20 = 21'd19066; end
                6'd43: begin q_val = 8'd64; inv_q_q20 = 21'd16384; end
                6'd44: begin q_val = 8'd81; inv_q_q20 = 21'd12946; end
                6'd45: begin q_val = 8'd104; inv_q_q20 = 21'd10083; end
                6'd46: begin q_val = 8'd113; inv_q_q20 = 21'd9280; end
                6'd47: begin q_val = 8'd92; inv_q_q20 = 21'd11398; end
                6'd48: begin q_val = 8'd49; inv_q_q20 = 21'd21400; end
                6'd49: begin q_val = 8'd64; inv_q_q20 = 21'd16384; end
                6'd50: begin q_val = 8'd78; inv_q_q20 = 21'd13444; end
                6'd51: begin q_val = 8'd87; inv_q_q20 = 21'd12053; end
                6'd52: begin q_val = 8'd103; inv_q_q20 = 21'd10181; end
                6'd53: begin q_val = 8'd121; inv_q_q20 = 21'd8666; end
                6'd54: begin q_val = 8'd120; inv_q_q20 = 21'd8739; end
                6'd55: begin q_val = 8'd101; inv_q_q20 = 21'd10382; end
                6'd56: begin q_val = 8'd72; inv_q_q20 = 21'd14564; end
                6'd57: begin q_val = 8'd92; inv_q_q20 = 21'd11398; end
                6'd58: begin q_val = 8'd95; inv_q_q20 = 21'd11038; end
                6'd59: begin q_val = 8'd98; inv_q_q20 = 21'd10700; end
                6'd60: begin q_val = 8'd112; inv_q_q20 = 21'd9363; end
                6'd61: begin q_val = 8'd100; inv_q_q20 = 21'd10486; end
                6'd62: begin q_val = 8'd103; inv_q_q20 = 21'd10181; end
                6'd63: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                default: begin q_val = 8'd16; inv_q_q20 = 21'd65536; end
            endcase
        end else begin
            case (raster_idx)
                6'd0: begin q_val = 8'd17; inv_q_q20 = 21'd61681; end
                6'd1: begin q_val = 8'd18; inv_q_q20 = 21'd58255; end
                6'd2: begin q_val = 8'd24; inv_q_q20 = 21'd43691; end
                6'd3: begin q_val = 8'd47; inv_q_q20 = 21'd22311; end
                6'd4: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd5: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd6: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd7: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd8: begin q_val = 8'd18; inv_q_q20 = 21'd58255; end
                6'd9: begin q_val = 8'd21; inv_q_q20 = 21'd49933; end
                6'd10: begin q_val = 8'd26; inv_q_q20 = 21'd40330; end
                6'd11: begin q_val = 8'd66; inv_q_q20 = 21'd15888; end
                6'd12: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd13: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd14: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd15: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd16: begin q_val = 8'd24; inv_q_q20 = 21'd43691; end
                6'd17: begin q_val = 8'd26; inv_q_q20 = 21'd40330; end
                6'd18: begin q_val = 8'd56; inv_q_q20 = 21'd18725; end
                6'd19: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd20: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd21: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd22: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd23: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd24: begin q_val = 8'd47; inv_q_q20 = 21'd22311; end
                6'd25: begin q_val = 8'd66; inv_q_q20 = 21'd15888; end
                6'd26: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd27: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd28: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd29: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd30: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd31: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd32: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd33: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd34: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd35: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd36: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd37: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd38: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd39: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd40: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd41: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd42: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd43: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd44: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd45: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd46: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd47: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd48: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd49: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd50: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd51: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd52: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd53: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd54: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd55: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd56: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd57: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd58: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd59: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd60: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd61: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd62: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                6'd63: begin q_val = 8'd99; inv_q_q20 = 21'd10592; end
                default: begin q_val = 8'd17; inv_q_q20 = 21'd61681; end
            endcase
        end
    end

endmodule
