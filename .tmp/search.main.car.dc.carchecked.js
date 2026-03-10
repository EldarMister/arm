define( [ 'jquery', 'utils', '�˻�_����_���������_�߻�'], function($, Utils, S) {


	S.prototype.requestRyvussWarrantResults = function(query, page) {
         var safeQuery = query;
         var resultData=null;
        $.ajax({
            type:'GET',
            url: '/dc/dc_carcheckedlist.do?method=recommend&queryStr='+query,
            dataType: "json",
            async : false,
            success: function(data){
                $("#section_recommand").hide();
                resultData = data[0].SearchResults;
                var html="";
                if( resultData.length > 0 ) {
                    html+="<h4 class='tit_recommand'>����� ���ݴ��� ������</h4>\n";
                    html+="<ul class='list_recommand'>\n";
                    for(var i =0; i<resultData.length; i++) {
                        var hrefStr="'/dc/dc_carcheckedlist.do?carType=for&wtClick_forList=019#!{\"action\":\"(And.Hidden.N._.(Or.ServiceMark.EncarDiagnosisP0._.ServiceMark.EncarDiagnosisP1._.ServiceMark.EncarDiagnosisP2.)_.(C.CarType.N._.(";
                        hrefStr += encodeURIComponent("C.Manufacturer." + encodeURIComponent(resultData[i].MNFCNM)) + "._.(";
                        hrefStr += encodeURIComponent("C.ModelGroup." + encodeURIComponent(resultData[i].MDLGROUPNM)) + "._.";
                        hrefStr += encodeURIComponent("Model." + encodeURIComponent(resultData[i].MDLNM));
                        hrefStr += ".)))_.Price.range(" + resultData[i].MINDMNDPRC.trim().replace(",", "") + ".." + resultData[i].MAXDMNDPRC.trim().replace(",", "") + ")";
                        hrefStr += "._.Mileage.range(" + resultData[i].MIN_MLG + ".." + resultData[i].MAX_MLG + ")._.Year.range(" + resultData[i].MIN_YR + ".." + resultData[i].MAX_YR + ").)\",\"toggle\":{},\"layer\":4,\"sort\":\"ModifiedDate\",\"page\":1,\"limit\":20}'";

                        var imageUrl = resultData[i].IMGPATH == null ? "/images/common/icon/no-image_ref.jpg" : resultData[i].IMGPATH;

                        html += "<li>\n";
                        html += "<a class='link_thumb' href=javascript:goPageDcCarchecked(" + hrefStr + ")>\n";
                        html += "<span class='thumb_img'>\n";
                        html += "<img src='" + imageUrl + "' class='img_thumb' alt=''/>\n";
                        html += "</span>\n";
                        html += "<strong class='service_badge_list'>\n";
                        html += "<em class='encar_badge encar_diagnosis_badge'>��ī����</em>\n";
                        html += "</strong>\n";
                        html += "<strong class='tit_item'><span class='txt_brand'>" + resultData[i].MNFCNM + "</span> " + resultData[i].MDLNM + "</strong>\n";

                        html += "<dl class='info_append'>\n";
                        html += "<dt>���ݴ�</dt><dd><span class='num_price'>" + resultData[i].MINDMNDPRC + "</span> ~ <span class='num_price'>" + resultData[i].MAXDMNDPRC + "</span>����</dd>\n";
                        html += "</dl>\n";
                        html += "</a>\n";
                        html += "</li>\n";
                    }
                    html+="</ul>\n";
                    $("#section_recommand").html(html);
                    $("#section_recommand").show();
                }
            }
        });
         return resultData;
    };
	var Class = function() {
		S.apply(this, arguments);
	};

	Class.prototype = $.extend(true, {}, S.prototype, {
		constructor : Class,
		/** @override */
		options : {
			/** @override */
			requestRyvussDefaultQuery : '(And.Hidden.N._.CarType.Y._.(Or.ServiceMark.EncarDiagnosisP0._.ServiceMark.EncarDiagnosisP1._.ServiceMark.EncarDiagnosisP2.))',
			/** @override */
			requestRyvussInavEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussPhotoResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussSpecialResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussNormalResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussWarrantResultsEndpoint : '/search/car/list/premium'
		}
	});

	return Class;
});
function goPageDcCarchecked(hrefStr) {

                jq$.ajax({
                type:'GET',
                url: '/dc/dc_carcheckedlist.do?method=updateRecommandViewCnt',
                dataType: "json",
                async : false,
                success: function(data){
                    location.href=hrefStr;
                }
        });

}