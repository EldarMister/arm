define( [ 'jquery', 'ko', '����', '�˻���_���������_�߻�', '�˻�_����_������_����' ], function($, ko, CM, S, Model) {
	var Class = function(options) {
		S.apply(this, arguments);
	};
	/**
	 * @override
	*/
    S.prototype.getDefaultHashbang = function() {
        return {
            action : '',
            toggle : {},
            layer : '',
            sort : 'ModifiedDate',
            page : 1,
            limit : 12
        };
    };
    
	Class.prototype = $.extend(true, {}, S.prototype, {
		constructor : Class,
		options : {
			modelClass : Model,

			linkToPhotoItemWtQuery : 'wtClick_forList=033',
			linkToPhotoItemUri : '/dc/dc_cardetailview.do?pageid=dc_carchecked&listAdvType=chk_list',
			//linkToPhotoItemUriParam : '?pageid=dc_carchecked&listAdvType=chk_list',
			linkToPhotoItemStatCode1 : '002',
			linkToPhotoItemStatCode2 : '002',

			linkToSpecialItemWtQuery : 'wtClick_forList=017',
			linkToSpecialItemUri : '/dc/dc_cardetailview.do?pageid=dc_carchecked&listAdvType=chk_list',
			//linkToSpecialItemUriParam : '?pageid=dc_carchecked&listAdvType=chk_list',
			linkToSpecialItemStatCode1 : '001',
			linkToSpecialItemStatCode2 : '002',

			linkToNormalItemWtQuery : 'wtClick_forList=019',
			linkToNormalItemUri : '/dc/dc_cardetailview.do?pageid=dc_carchecked&listAdvType=chk_list',
			//linkToNormalItemUriParam : '?pageid=dc_carchecked&listAdvType=chk_list',
			linkToNormalItemStatCode1 : '003',
			linkToNormalItemStatCode2 : '002',

			linkToWarrantItemWtQuery : 'wtClick_forList=050',
			linkToWarrantItemUri : '/dc/dc_cardetailview.do?pageid=dc_carchecked&listAdvType=chk_list',
			//linkToWarrantItemUriParam : '?pageid=dc_carchecked&listAdvType=chk_list',
			linkToWarrantItemStatCode1 : null,
			linkToWarrantItemStatCode2 : null,

			openOptionsGuideWindowUri : "/dc/dc_carsearchpop.do?method=optionDic&optncd=&wtClick_carview=028",
			openHotmarkGuideWindowUri : "/dc/dc_carsearch_v13_pp0.htm?wtClick_forList=009"
		},
		/** @constant {object} �귣�� ���������� ���ؼ� �������� ����ϱ� ���� ��������. Key�� ������ �ڵ��̴�. */
		brandIconNameMap : {
			/* BMW */
			'012' : 'bmwbps_certicon.gif',
			/* ���� */
			'013' : 'benzcert_certicon.gif',
			/* ������ */
			'035' : 'lexuscert_certicon.gif',
			/* ��Ծ� */
			'019' : 'jaguarcert_certicon.gif',
			/* ����ι� */
			'020' : 'landrovercert_certicon.gif',
			/* ������ */
			'015' : 'porschecert_certicon.gif',
			/* �����ٰ� */
			'014' : 'vwuc_certicon.gif',
			/* �ƿ�� */
			'011' : 'audicert_certicon.gif',
			/* �̴� */
			'054' : 'minicert_certicon.gif',
			/* �ѽ����̽� */
			'047' : 'rrcert_certicon.gif'
		},
		/** @override */
		getNamespace : function() {
			return 'fc';
		},
		/** @function (�������)��� �������� ��ǥ �̹��� ��� */
		getDataCertIconSrc : function(data) {
			var src = this.brandIconNameMap[data.Manufacturer.Code];

			return src && [ '/images/fc/mnfccert/', src ].join('');
		},
		/**
		 * @override
		 * @function �������� �����ڿ��� �α�� ������ �����Ѵ�.
		 */
		getNavManufacturerLazyContext : function() {
			var f = S.prototype.getNavManufacturerLazyContext.apply(this, arguments);

			if (f) {
				f.carType = 'for';
				/* ������ ������ 12�� �̻��϶��� �α�� ������ �����Ѵ�. */
				if (f.$Facets.length > 11) {
					/* �������� �����ڿ��� �α�� ������ �����Ѵ�. */
					f.$FacetsPopular = f.$Facets.slice(0).sort(function(a, b) {
						return b.Count - a.Count;
					}).slice(0, 7/* TODO ���ó�� */);
				}
			}

			return f;
		}
	});

	return Class;
});